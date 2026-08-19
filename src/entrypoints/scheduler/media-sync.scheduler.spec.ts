import { describe, expect, it, vi } from "vitest";

import type { MediaApi, SyncResult } from "@media";

import { MediaSyncScheduler } from "./media-sync.scheduler.js";

describe("MediaSyncScheduler", () => {
  it("registers configured feed sync jobs and invokes MediaApi", async () => {
    const sync = vi.fn<MediaApi["sync"]>().mockResolvedValue({
      created: 1,
      updated: 0,
      skipped: 0,
      errors: []
    } satisfies SyncResult);
    const schedule = vi.fn((_expression: string, handler: () => void | Promise<void>) => {
      void handler();
      return { stop: vi.fn() };
    });
    const scheduler = new MediaSyncScheduler(
      {
        sync,
      },
      {
        MEDIA_SYNC_TMDB_FEED_CRON: "0 * * * *"
      },
      schedule
    );

    scheduler.start();
    await Promise.resolve();

    expect(schedule).toHaveBeenCalledWith("0 * * * *", expect.any(Function));
    expect(sync).toHaveBeenCalledWith(
      {
        provider: "tmdb",
        params: {
          target: "feed",
          feed: "popular"
        }
      },
      {
        id: "system-media-sync",
        role: "admin",
        permissions: ["media:write"]
      }
    );
  });
});
