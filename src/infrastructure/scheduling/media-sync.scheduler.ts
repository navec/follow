import type { User } from "@domain/auth/entities/user.js";
import type { SyncRequest } from "@application/media/dto/sync-request.dto.js";
import type { SyncResult } from "@application/media/dto/sync-result.dto.js";

type ScheduleFn = (expression: string, handler: () => void | Promise<void>) => {
  stop?: () => void;
};

type SyncMediaUseCasePort = {
  execute(request: SyncRequest, actor: User): Promise<SyncResult>;
};

type SchedulerEnv = {
  MEDIA_SYNC_TMDB_FEED_CRON?: string | undefined;
};

const systemActor: User = {
  id: "system-media-sync",
  email: "system@follow.local",
  passwordHash: "",
  role: "admin",
  permissions: ["media:write"],
  createdAt: new Date("2026-03-10T00:00:00.000Z"),
  updatedAt: new Date("2026-03-10T00:00:00.000Z")
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
