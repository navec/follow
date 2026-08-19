import type { MediaActor, MediaApi } from "@media";

type ScheduleFn = (expression: string, handler: () => void | Promise<void>) => {
  stop?: () => void;
};

type SchedulerEnv = {
  MEDIA_SYNC_TMDB_FEED_CRON?: string | undefined;
};

const systemActor: MediaActor = {
  id: "system-media-sync",
  role: "admin",
  permissions: ["media:write"]
};

export class MediaSyncScheduler {
  constructor(
    private readonly mediaApi: MediaApi,
    private readonly env: SchedulerEnv,
    private readonly schedule: ScheduleFn
  ) {}

  start(): void {
    if (this.env.MEDIA_SYNC_TMDB_FEED_CRON) {
      this.schedule(this.env.MEDIA_SYNC_TMDB_FEED_CRON, async () => {
        await this.mediaApi.sync(
          {
            provider: "tmdb",
            params: {
              target: "feed",
              feed: "popular"
            }
          },
          systemActor
        );
      });
    }
  }
}
