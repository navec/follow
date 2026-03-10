import { describe, expect, it, vi } from "vitest";

import type { SyncResult } from "@application/media/dto/sync-result.dto.js";

import { MediaSyncScheduler } from "./media-sync.scheduler.js";

describe("MediaSyncScheduler", () => {
  it("registers configured feed sync jobs and invokes the shared use case", async () => {
    const execute = vi.fn().mockResolvedValue({
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
        execute
      },
      {
        MEDIA_SYNC_TMDB_FEED_CRON: "0 * * * *"
      },
      schedule
    );

    scheduler.start();
    await Promise.resolve();

    expect(schedule).toHaveBeenCalledWith("0 * * * *", expect.any(Function));
    expect(execute).toHaveBeenCalledWith(
      {
        provider: "tmdb",
        params: {
          target: "feed",
          feed: "popular"
        }
      },
      expect.objectContaining({
        role: "admin",
        permissions: ["media:write"]
      })
    );
  });
});
