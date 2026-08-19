import type { SyncRequest } from "@application/media/dto/sync-request.dto.js";
import type { SyncResult } from "@application/media/dto/sync-result.dto.js";
import type { MediaActor } from "@application/media/models/media-actor.js";

type ScheduleFn = (expression: string, handler: () => void | Promise<void>) => {
  stop?: () => void;
};

type SyncMediaUseCasePort = {
  execute(request: SyncRequest, actor: MediaActor): Promise<SyncResult>;
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
    private readonly syncMediaUseCase: SyncMediaUseCasePort,
    private readonly env: SchedulerEnv,
    private readonly schedule: ScheduleFn
  ) {}

  start(): void {
    if (this.env.MEDIA_SYNC_TMDB_FEED_CRON) {
      this.schedule(this.env.MEDIA_SYNC_TMDB_FEED_CRON, async () => {
        await this.syncMediaUseCase.execute(
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
