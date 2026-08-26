import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  closeIntegrationTestContext,
  createIntegrationTestContext,
  type IntegrationTestContext,
} from "@tests/integration/helpers/test-app.js";
import { truncateTestTables } from "@tests/integration/helpers/test-db.js";

describe("TMDB catalog synchronization integration", () => {
  let context: IntegrationTestContext;
  let titleVersion = "Original";
  const failNext = new Set<number>();
  const detailRequests: number[] = [];

  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url =
      input instanceof URL
        ? input
        : new URL(input instanceof Request ? input.url : input);
    if (url.hostname === "files.tmdb.org") {
      const inventory = [
        { adult: false, id: 101, popularity: 30, video: false },
        { adult: false, id: 102, popularity: 20, video: false },
        { adult: false, id: 103, popularity: 10, video: false },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n");
      return new Response(gzipSync(inventory), { status: 200 });
    }

    if (url.pathname.endsWith("/movie/changes")) {
      return Response.json({
        page: 1,
        total_pages: 1,
        results: [{ id: 101 }],
      });
    }

    const movieMatch = /\/movie\/(\d+)$/.exec(url.pathname);
    if (movieMatch) {
      const tmdbId = Number(movieMatch[1]);
      detailRequests.push(tmdbId);
      if (failNext.delete(tmdbId)) {
        return new Response(null, { status: 503 });
      }
      return Response.json(createMoviePayload(tmdbId, titleVersion));
    }

    throw new Error(`Unexpected fake TMDB request: ${url.href}`);
  });

  beforeAll(async () => {
    context = await createIntegrationTestContext({
      env: {
        TMDB_READ_ACCESS_TOKEN: "integration-token",
        MEDIA_SYNC_TMDB_CATALOG_EXPORT_CRON: "0 8 * * *",
        MEDIA_SYNC_TMDB_CATALOG_CHANGES_CRON: "15 * * * *",
        MEDIA_SYNC_TMDB_CATALOG_WORKER_CRON: "*/1 * * * *",
        TMDB_CATALOG_WORKER_BATCH_SIZE: 10,
        TMDB_CATALOG_REQUESTS_PER_SECOND: 1000,
        TMDB_CATALOG_CONCURRENCY: 1,
        TMDB_CATALOG_RETRY_BASE_MS: 1,
        TMDB_CATALOG_RETRY_MAX_MS: 10,
      },
      fetchImpl: fetchImpl as never,
    });
  });

  beforeEach(async () => {
    titleVersion = "Original";
    failNext.clear();
    detailRequests.length = 0;
    fetchImpl.mockClear();
    await truncateTestTables(context.pgPool, [
      "tmdb_movie_sync_queue",
      "tmdb_movie_inventory_staging",
      "sources",
      "works",
      "contributors",
      "images",
      "locales",
    ]);
  });

  afterAll(async () => {
    await closeIntegrationTestContext(context);
  });

  it("hydrates the complete queue idempotently and isolates transient failures", async () => {
    const inventoryJob = findJob("media-sync-tmdb-catalog-inventory");
    const changesJob = findJob("media-sync-tmdb-catalog-changes");
    const workerJob = findJob("media-sync-tmdb-catalog-worker");

    await inventoryJob.handler();
    await workerJob.handler();

    expect(detailRequests).toEqual([101, 102, 103]);
    const detailUrl = fetchImpl.mock.calls
      .map(([input]) => String(input))
      .find((url) => url.includes("/movie/101?"));
    expect(detailUrl).toContain(
      "append_to_response=translations%2Ccredits%2Cimages",
    );
    await expect(queueStatuses()).resolves.toEqual([
      { tmdb_id: 101, status: "completed" },
      { tmdb_id: 102, status: "completed" },
      { tmdb_id: 103, status: "completed" },
    ]);

    await expect(
      context.pgPool.query(
        `SELECT COUNT(DISTINCT w.id)::int AS works,
                COUNT(DISTINCT wi.locale_code)::int AS translations,
                COUNT(DISTINCT wc.contributor_id)::int AS cast,
                COUNT(DISTINCT wimg.image_id)::int AS gallery_images,
                COUNT(DISTINCT ci.image_id)::int AS profile_images
         FROM works w
         JOIN work_i18n wi ON wi.work_id = w.id
         JOIN work_contributors wc ON wc.work_id = w.id
         JOIN work_images wimg ON wimg.work_id = w.id
         JOIN contributor_images ci ON ci.contributor_id = wc.contributor_id`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          works: 3,
          translations: 2,
          cast: 3,
          gallery_images: 6,
          profile_images: 3,
        },
      ],
    });

    titleVersion = "Updated";
    await changesJob.handler();
    await workerJob.handler();

    await expect(
      context.pgPool.query(
        `SELECT COUNT(*)::int AS count FROM works`,
      ),
    ).resolves.toMatchObject({ rows: [{ count: 3 }] });
    await expect(
      context.pgPool.query(
        `SELECT wi.title
         FROM work_i18n wi
         JOIN source_works sw ON sw.work_id = wi.work_id
         JOIN sources s ON s.id = sw.source_id
         WHERE s.name = 'tmdb'
           AND sw.source_value = '101'
           AND wi.locale_code = 'fr-FR'`,
      ),
    ).resolves.toMatchObject({ rows: [{ title: "Updated 101 FR" }] });

    failNext.add(102);
    await context.pgPool.query(
      `UPDATE tmdb_movie_sync_queue
       SET status = 'pending', next_attempt_at = NULL
       WHERE tmdb_id IN (102, 103)`,
    );
    await workerJob.handler();

    await expect(queueStatuses()).resolves.toEqual([
      { tmdb_id: 101, status: "completed" },
      { tmdb_id: 102, status: "retry" },
      { tmdb_id: 103, status: "completed" },
    ]);

    await context.pgPool.query(
      `UPDATE tmdb_movie_sync_queue
       SET next_attempt_at = NOW() - INTERVAL '1 second'
       WHERE tmdb_id = 102`,
    );
    await workerJob.handler();
    await expect(queueStatuses()).resolves.toEqual([
      { tmdb_id: 101, status: "completed" },
      { tmdb_id: 102, status: "completed" },
      { tmdb_id: 103, status: "completed" },
    ]);
  });

  function findJob(id: string) {
    const job = context.media.scheduledJobs.find((candidate) => candidate.id === id);
    if (!job) {
      throw new Error(`Missing integration job: ${id}`);
    }
    return job;
  }

  async function queueStatuses() {
    const result = await context.pgPool.query(
      `SELECT tmdb_id::int AS tmdb_id, status
       FROM tmdb_movie_sync_queue
       ORDER BY tmdb_id`,
    );
    return result.rows;
  }
});

function createMoviePayload(tmdbId: number, titleVersion: string) {
  return {
    id: tmdbId,
    status: "Released",
    original_title: `${titleVersion} ${tmdbId}`,
    original_language: "en",
    release_date: "2026-01-01",
    translations: {
      translations: [
        {
          iso_639_1: "fr",
          iso_3166_1: "FR",
          data: { title: `${titleVersion} ${tmdbId} FR`, overview: "Résumé" },
        },
        {
          iso_639_1: "en",
          iso_3166_1: "US",
          data: { title: `${titleVersion} ${tmdbId} EN`, overview: "Summary" },
        },
      ],
    },
    credits: {
      cast: [
        {
          id: tmdbId + 1000,
          name: `Actor ${tmdbId}`,
          character: "Lead",
          profile_path: `/profile-${tmdbId}.jpg`,
        },
      ],
      crew: [],
    },
    images: {
      posters: [{ file_path: `/poster-${tmdbId}.jpg`, iso_639_1: "fr" }],
      backdrops: [
        { file_path: `/backdrop-${tmdbId}.jpg`, iso_639_1: null },
      ],
    },
  };
}
