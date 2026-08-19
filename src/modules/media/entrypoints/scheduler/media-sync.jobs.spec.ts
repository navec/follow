import { describe, expect, it, vi } from "vitest";

import type { MediaApi, SyncResult } from "../../public/media-api.js";

import { createMediaSyncJobs } from "./media-sync.jobs.js";

describe("Media sync jobs", () => {
  it("declares a configured feed job and invokes MediaApi", async () => {
    const sync = vi.fn<MediaApi["sync"]>().mockResolvedValue({
      created: 1,
      updated: 0,
      skipped: 0,
      errors: [],
    } satisfies SyncResult);

    const jobs = createMediaSyncJobs({
      api: { sync },
      tmdbFeedCron: "0 * * * *",
    });

    expect(jobs).toMatchObject([
      { id: "media-sync-tmdb-feed", expression: "0 * * * *" },
    ]);
    await jobs[0]?.handler();
    expect(sync).toHaveBeenCalledWith(
      {
        provider: "tmdb",
        params: { target: "feed", feed: "popular" },
      },
      {
        id: "system-media-sync",
        role: "admin",
        permissions: ["media:write"],
      },
    );
  });

  it("declares no job when the feed cron is absent", () => {
    expect(createMediaSyncJobs({ api: { sync: vi.fn() } })).toEqual([]);
  });
});
