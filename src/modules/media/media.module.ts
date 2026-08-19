import type { MediaSyncProviderPort } from "./application/ports/out/media-sync-provider.port.js";
import type { MediaSyncRepositoryPort } from "./application/ports/out/media-sync-repository.port.js";
import { MediaAuthorizationPolicy } from "./application/services/media-authorization.policy.js";
import { SyncMediaUseCase } from "./application/use-cases/sync-media.use-case.js";
import { createMediaHttpDefinition } from "./entrypoints/http/media.routes.js";
import { createMediaSyncJobs } from "./entrypoints/scheduler/media-sync.jobs.js";
import type { MediaApi } from "./public/media-api.js";

interface MediaModuleDependencies {
  providers: ReadonlyArray<MediaSyncProviderPort>;
  repository: MediaSyncRepositoryPort;
  http: { bodyValidator: BodyValidator };
  scheduler: { tmdbFeedCron?: string | undefined };
}

export interface MediaModule {
  api: MediaApi;
  http: HttpModuleDefinition;
  scheduledJobs: ReadonlyArray<ScheduledJobDefinition>;
}

export function createMediaModule({
  providers,
  repository,
  http,
  scheduler,
}: MediaModuleDependencies): MediaModule {
  const syncMedia = new SyncMediaUseCase(
    providers,
    repository,
    new MediaAuthorizationPolicy(),
  );

  const api: MediaApi = {
    sync: (command, actor) => syncMedia.execute(command, actor),
  };

  return {
    api,
    http: createMediaHttpDefinition({ api, bodyValidator: http.bodyValidator }),
    scheduledJobs: createMediaSyncJobs({
      api,
      tmdbFeedCron: scheduler.tmdbFeedCron,
    }),
  };
}
import type { HttpModuleDefinition } from "../../shared/http/contracts/http-module-definition.js";
import type { BodyValidator } from "../../shared/http/validation/validator.js";
import type { ScheduledJobDefinition } from "../../shared/scheduling/scheduled-job-definition.js";
