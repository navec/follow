import { describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@platform/config/index.js";
import { createContainer } from "@bootstrap/container.js";

const { tmdbProviderConstructor } = vi.hoisted(() => ({
  tmdbProviderConstructor: vi.fn(),
}));

vi.mock("@media/adapters/out/tmdb/tmdb-media-sync.provider.js", () => ({
  TmdbMediaSyncProvider: class {
    constructor(client: unknown, options?: unknown) {
      tmdbProviderConstructor(client, options);
    }

    supports() {
      return true;
    }

    async fetch() {
      return [];
    }
  },
}));

const testEnv: AppEnv = {
  NODE_ENV: "test",
  PORT: 0,
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/follow_test",
  JWT_SECRET: "container-test-secret",
  JWT_EXPIRES_IN: "1h",
  TMDB_BASE_URL: "https://api.themoviedb.org/3",
  TMDB_IMAGE_BASE_URL: "https://image.tmdb.org/t/p/original",
  TMDB_DEFAULT_LANGUAGE: "fr-FR",
  TMDB_DEFAULT_REGION: "FR",
  TMDB_REQUEST_TIMEOUT_MS: 5000,
  TMDB_EXPORT_BASE_URL: "https://files.tmdb.org/p/exports/",
  TMDB_CATALOG_STAGE_BATCH_SIZE: 1000,
  TMDB_CATALOG_WORKER_BATCH_SIZE: 100,
  TMDB_CATALOG_REQUESTS_PER_SECOND: 5,
  TMDB_CATALOG_CONCURRENCY: 5,
  TMDB_CATALOG_LEASE_SECONDS: 300,
  TMDB_CATALOG_MAX_ATTEMPTS: 8,
  TMDB_CATALOG_RETRY_BASE_MS: 1000,
  TMDB_CATALOG_RETRY_MAX_MS: 3_600_000,
};

describe("createContainer", () => {
  it("exposes module contributions and lifecycle resources", async () => {
    const container = createContainer(testEnv);

    try {
      expect(container.authApi).toBeDefined();
      expect(container.mediaApi).toBeDefined();
      expect(container.auth.http.id).toBe("auth");
      expect(container.media.http.id).toBe("media");
      expect(container.httpEndpoints).toEqual([
        { method: "GET", path: "/health" },
        { method: "POST", path: "/auth/register" },
        { method: "POST", path: "/auth/login" },
        { method: "GET", path: "/auth/me" },
        { method: "POST", path: "/media/sync" },
      ]);
      expect(container.pgPool).toBeDefined();
      expect(tmdbProviderConstructor).toHaveBeenCalledWith(
        expect.anything(),
        { defaultLocale: "fr-FR" },
      );
    } finally {
      await container.pgPool.end();
    }
  });

  it("wires the three catalog jobs when token and crons are configured", async () => {
    const container = createContainer({
      ...testEnv,
      TMDB_READ_ACCESS_TOKEN: "tmdb-token",
      MEDIA_SYNC_TMDB_CATALOG_EXPORT_CRON: "0 8 * * *",
      MEDIA_SYNC_TMDB_CATALOG_CHANGES_CRON: "15 * * * *",
      MEDIA_SYNC_TMDB_CATALOG_WORKER_CRON: "*/1 * * * *",
    });

    try {
      expect(container.media.scheduledJobs).toMatchObject([
        { id: "media-sync-tmdb-catalog-inventory" },
        { id: "media-sync-tmdb-catalog-changes" },
        { id: "media-sync-tmdb-catalog-worker" },
      ]);
    } finally {
      await container.pgPool.end();
    }
  });
});
