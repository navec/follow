import type { MediaSyncProviderPort } from "@media/application/ports/out/media-sync-provider.port.js";
import type { MediaSyncRepositoryPort } from "@media/application/ports/out/media-sync-repository.port.js";
import type { TmdbCatalogSourcePort } from "@media/application/ports/out/tmdb-catalog-source.port.js";
import type { TmdbCatalogSyncRepositoryPort } from "@media/application/ports/out/tmdb-catalog-sync-repository.port.js";
import { MediaAuthorizationPolicy } from "@media/application/services/media-authorization.policy.js";
import { DiscoverTmdbMovieChangesUseCase } from "@media/application/use-cases/discover-tmdb-movie-changes.use-case.js";
import type { ProcessTmdbMovieQueueOptions } from "@media/application/use-cases/process-tmdb-movie-queue.use-case.js";
import { ProcessTmdbMovieQueueUseCase } from "@media/application/use-cases/process-tmdb-movie-queue.use-case.js";
import { ReconcileTmdbMovieCatalogUseCase } from "@media/application/use-cases/reconcile-tmdb-movie-catalog.use-case.js";
import { SyncMediaUseCase } from "@media/application/use-cases/sync-media.use-case.js";
import { createMediaHttpDefinition } from "@media/entrypoints/http/media.routes.js";
import { createMediaSyncJobs } from "@media/entrypoints/scheduler/media-sync.jobs.js";
import type { MediaActor, MediaApi } from "@media/public/media-api.js";
import type { HttpModuleDefinition } from "@shared/http/contracts/http-module-definition.js";
import type { BodyValidator } from "@shared/http/validation/validator.js";
import type { ScheduledJobDefinition } from "@shared/scheduling/scheduled-job-definition.js";

interface MediaModuleDependencies {
  providers: ReadonlyArray<MediaSyncProviderPort>;
  repository: MediaSyncRepositoryPort;
  http: { bodyValidator: BodyValidator };
  scheduler: {
    tmdbFeedCron?: string | undefined;
    tmdbCatalogExportCron?: string | undefined;
    tmdbCatalogChangesCron?: string | undefined;
    tmdbCatalogWorkerCron?: string | undefined;
  };
  catalog?:
    | {
        source?: TmdbCatalogSourcePort | undefined;
        repository?: TmdbCatalogSyncRepositoryPort | undefined;
        stageBatchSize: number;
        worker: ProcessTmdbMovieQueueOptions;
        clock?: (() => Date) | undefined;
      }
    | undefined;
}

export interface MediaModule {
  api: MediaApi;
  http: HttpModuleDefinition;
  scheduledJobs: ReadonlyArray<ScheduledJobDefinition>;
}

const systemMediaActor: MediaActor = {
  id: "system-media-sync",
  role: "admin",
  permissions: ["media:write"],
};

export function createMediaModule({
  providers,
  repository,
  http,
  scheduler,
  catalog,
}: MediaModuleDependencies): MediaModule {
  const syncMedia = new SyncMediaUseCase(
    providers,
    repository,
    new MediaAuthorizationPolicy(),
  );
  const clock = catalog?.clock ?? (() => new Date());

  const api: MediaApi = {
    sync: (command, actor) => syncMedia.execute(command, actor),
  };

  let reconcileCatalog: ((exportDate: string) => Promise<unknown>) | undefined;
  let discoverChanges: (() => Promise<unknown>) | undefined;
  let processQueue: (() => Promise<unknown>) | undefined;
  if (catalog?.source && catalog.repository) {
    const reconcile = new ReconcileTmdbMovieCatalogUseCase(
      catalog.source,
      catalog.repository,
      catalog.stageBatchSize,
    );
    const discover = new DiscoverTmdbMovieChangesUseCase(
      catalog.source,
      catalog.repository,
      clock,
    );
    const process = new ProcessTmdbMovieQueueUseCase(
      catalog.repository,
      (tmdbId) =>
        syncMedia.execute(
          {
            provider: "tmdb",
            params: { target: "work", externalId: tmdbId, type: "movie" },
          },
          systemMediaActor,
        ),
      catalog.worker,
      clock,
    );
    reconcileCatalog = (exportDate) => reconcile.execute(exportDate);
    discoverChanges = () => discover.execute();
    processQueue = () => process.execute();
  }

  return {
    api,
    http: createMediaHttpDefinition({ api, bodyValidator: http.bodyValidator }),
    scheduledJobs: createMediaSyncJobs({
      syncPopularFeed: () =>
        syncMedia.execute(
          { provider: "tmdb", params: { target: "feed", feed: "popular" } },
          systemMediaActor,
        ),
      reconcileCatalog,
      discoverChanges,
      processQueue,
      tmdbFeedCron: scheduler.tmdbFeedCron,
      tmdbCatalogExportCron: scheduler.tmdbCatalogExportCron,
      tmdbCatalogChangesCron: scheduler.tmdbCatalogChangesCron,
      tmdbCatalogWorkerCron: scheduler.tmdbCatalogWorkerCron,
      clock,
    }),
  };
}
