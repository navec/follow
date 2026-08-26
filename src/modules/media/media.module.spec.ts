import { describe, expect, it, vi } from "vitest";

import type { MediaSyncProviderPort } from "@media/application/ports/out/media-sync-provider.port.js";
import type { MediaSyncRepositoryPort } from "@media/application/ports/out/media-sync-repository.port.js";
import { createMediaModule } from "@media/media.module.js";
import type { BodyValidator } from "@shared/http/validation/validator.js";

describe("createMediaModule", () => {
  it("exposes a public facade that delegates media synchronization", async () => {
    const provider: MediaSyncProviderPort = {
      supports: vi.fn().mockReturnValue(true),
      fetch: vi.fn().mockResolvedValue([]),
    };
    const repository: MediaSyncRepositoryPort = {
      upsertMany: vi.fn().mockResolvedValue({
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [],
      }),
    };
    const bodyValidator: BodyValidator = {
      parse: vi.fn((_schema, input) => input) as BodyValidator["parse"],
    };
    const media = createMediaModule({
      providers: [provider],
      repository,
      http: { bodyValidator },
      scheduler: { tmdbFeedCron: "0 * * * *" },
    });
    const command = {
      provider: "tmdb" as const,
      params: { target: "feed" as const, feed: "popular" },
    };
    const actor = {
      id: "admin-1",
      role: "admin",
      permissions: ["media:write"],
    };

    await media.api.sync(command, actor);

    expect(provider.fetch).toHaveBeenCalledWith(command);
    expect(repository.upsertMany).toHaveBeenCalledWith([]);
    expect(media.http).toMatchObject({
      id: "media",
      basePath: "/media",
      routes: [
        { method: "POST", path: "/sync", access: "authenticated" },
      ],
    });
    expect(media.scheduledJobs).toMatchObject([
      { id: "media-sync-tmdb-feed", expression: "0 * * * *" },
    ]);
  });

  it("wires bounded TMDB catalog operations only when both ports are present", async () => {
    const provider: MediaSyncProviderPort = {
      supports: vi.fn().mockReturnValue(true),
      fetch: vi.fn().mockResolvedValue([]),
    };
    const repository: MediaSyncRepositoryPort = {
      upsertMany: vi.fn().mockResolvedValue({
        created: 0,
        updated: 1,
        skipped: 0,
        errors: [],
      }),
    };
    const bodyValidator: BodyValidator = {
      parse: vi.fn((_schema, input) => input) as BodyValidator["parse"],
    };
    const catalogSource = {
      streamMovieInventory: vi.fn(async function* () {
        yield { tmdbId: 550, popularity: 99 };
      }),
      getChangedMovieIds: vi
        .fn()
        .mockResolvedValue({ ids: [], page: 1, totalPages: 1 }),
    };
    const claimTime = new Date("2026-08-25T09:00:00.000Z");
    const catalogRepository = {
      withJobLock: vi.fn(async (_key: string, task: () => Promise<unknown>) =>
        task(),
      ),
      resetInventoryStage: vi.fn(),
      stageInventoryBatch: vi.fn(),
      reconcileInventory: vi
        .fn()
        .mockResolvedValue({ inserted: 1, updated: 0, missing: 0 }),
      getLastCompletedChangesAt: vi.fn().mockResolvedValue(undefined),
      requestRefresh: vi.fn(),
      completeChangesWindow: vi.fn(),
      requeueExpiredLeases: vi.fn().mockResolvedValue(0),
      claimBatch: vi.fn().mockResolvedValue([
        {
          tmdbId: 550,
          popularity: 99,
          attempts: 1,
          claimedAt: claimTime,
        },
      ]),
      completeMovie: vi.fn(),
      retryMovie: vi.fn(),
      markMovieUnavailable: vi.fn(),
    };
    const media = createMediaModule({
      providers: [provider],
      repository,
      http: { bodyValidator },
      scheduler: {
        tmdbCatalogExportCron: "0 8 * * *",
        tmdbCatalogChangesCron: "15 * * * *",
        tmdbCatalogWorkerCron: "*/1 * * * *",
      },
      catalog: {
        source: catalogSource,
        repository: catalogRepository as never,
        stageBatchSize: 2,
        worker: {
          batchSize: 10,
          leaseSeconds: 300,
          requestsPerSecond: 5,
          concurrency: 1,
          maxAttempts: 8,
          retryBaseMs: 1000,
          retryMaxMs: 6000,
        },
        clock: () => claimTime,
      },
    });

    expect(media.scheduledJobs).toMatchObject([
      { id: "media-sync-tmdb-catalog-inventory" },
      { id: "media-sync-tmdb-catalog-changes" },
      { id: "media-sync-tmdb-catalog-worker" },
    ]);

    for (const job of media.scheduledJobs) {
      await job.handler();
    }

    expect(catalogRepository.reconcileInventory).toHaveBeenCalledWith(
      "2026-08-25",
    );
    expect(catalogSource.getChangedMovieIds).toHaveBeenCalledOnce();
    expect(provider.fetch).toHaveBeenCalledWith({
      provider: "tmdb",
      params: { target: "work", externalId: 550, type: "movie" },
    });
    expect(repository.upsertMany).toHaveBeenCalledWith([]);
    expect(catalogRepository.completeMovie).toHaveBeenCalledWith(
      550,
      claimTime,
      claimTime,
    );
  });

  it("does not declare catalog jobs when one catalog port is missing", () => {
    const bodyValidator: BodyValidator = {
      parse: vi.fn((_schema, input) => input) as BodyValidator["parse"],
    };
    const media = createMediaModule({
      providers: [],
      repository: { upsertMany: vi.fn() },
      http: { bodyValidator },
      scheduler: { tmdbCatalogExportCron: "0 8 * * *" },
      catalog: {
        source: {
          streamMovieInventory: vi.fn(),
          getChangedMovieIds: vi.fn(),
        },
        stageBatchSize: 1000,
        worker: {
          batchSize: 10,
          leaseSeconds: 300,
          requestsPerSecond: 5,
          concurrency: 1,
          maxAttempts: 8,
          retryBaseMs: 1000,
          retryMaxMs: 6000,
        },
      },
    });

    expect(media.scheduledJobs).toEqual([]);
  });
});
