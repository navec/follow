import { describe, expect, it, vi } from "vitest";

import { createMediaSyncJobs } from "@media/entrypoints/scheduler/media-sync.jobs.js";

describe("Media sync jobs", () => {
  it("keeps the configured popular feed job unchanged", async () => {
    const syncPopularFeed = vi.fn().mockResolvedValue(undefined);

    const jobs = createMediaSyncJobs({
      syncPopularFeed,
      tmdbFeedCron: "0 * * * *",
    });

    expect(jobs).toMatchObject([
      { id: "media-sync-tmdb-feed", expression: "0 * * * *" },
    ]);
    await jobs[0]?.handler();
    expect(syncPopularFeed).toHaveBeenCalledOnce();
  });

  it("declares three independent bounded catalog jobs", async () => {
    const reconcileCatalog = vi.fn().mockResolvedValue(undefined);
    const discoverChanges = vi.fn().mockResolvedValue(undefined);
    const processQueue = vi.fn().mockResolvedValue(undefined);
    const jobs = createMediaSyncJobs({
      syncPopularFeed: vi.fn(),
      reconcileCatalog,
      discoverChanges,
      processQueue,
      tmdbCatalogExportCron: "0 8 * * *",
      tmdbCatalogChangesCron: "15 * * * *",
      tmdbCatalogWorkerCron: "*/1 * * * *",
      clock: () => new Date("2026-08-25T07:59:00.000Z"),
    });

    expect(jobs).toMatchObject([
      {
        id: "media-sync-tmdb-catalog-inventory",
        expression: "0 8 * * *",
      },
      {
        id: "media-sync-tmdb-catalog-changes",
        expression: "15 * * * *",
      },
      {
        id: "media-sync-tmdb-catalog-worker",
        expression: "*/1 * * * *",
      },
    ]);

    await jobs[0]?.handler();
    expect(reconcileCatalog).toHaveBeenCalledWith("2026-08-24");
    expect(discoverChanges).not.toHaveBeenCalled();
    expect(processQueue).not.toHaveBeenCalled();

    await jobs[1]?.handler();
    expect(discoverChanges).toHaveBeenCalledOnce();
    expect(processQueue).not.toHaveBeenCalled();

    await jobs[2]?.handler();
    expect(processQueue).toHaveBeenCalledOnce();
  });

  it("uses the current UTC export date from 08:00 onward", async () => {
    const reconcileCatalog = vi.fn().mockResolvedValue(undefined);
    const jobs = createMediaSyncJobs({
      syncPopularFeed: vi.fn(),
      reconcileCatalog,
      tmdbCatalogExportCron: "0 8 * * *",
      clock: () => new Date("2026-08-25T08:00:00.000Z"),
    });

    await jobs[0]?.handler();

    expect(reconcileCatalog).toHaveBeenCalledWith("2026-08-25");
  });

  it("declares only independently configured jobs", () => {
    const jobs = createMediaSyncJobs({
      syncPopularFeed: vi.fn(),
      discoverChanges: vi.fn(),
      tmdbCatalogChangesCron: "15 * * * *",
    });

    expect(jobs).toMatchObject([
      { id: "media-sync-tmdb-catalog-changes", expression: "15 * * * *" },
    ]);
  });
});
