import type { ScheduledJobDefinition } from "@shared/scheduling/scheduled-job-definition.js";

interface MediaSyncJobsDependencies {
  syncPopularFeed: () => Promise<unknown>;
  reconcileCatalog?: ((exportDate: string) => Promise<unknown>) | undefined;
  discoverChanges?: (() => Promise<unknown>) | undefined;
  processQueue?: (() => Promise<unknown>) | undefined;
  tmdbFeedCron?: string | undefined;
  tmdbCatalogExportCron?: string | undefined;
  tmdbCatalogChangesCron?: string | undefined;
  tmdbCatalogWorkerCron?: string | undefined;
  clock?: (() => Date) | undefined;
}

export function createMediaSyncJobs(
  dependencies: MediaSyncJobsDependencies,
): ReadonlyArray<ScheduledJobDefinition> {
  const jobs: ScheduledJobDefinition[] = [];

  if (dependencies.tmdbFeedCron) {
    jobs.push({
      id: "media-sync-tmdb-feed",
      expression: dependencies.tmdbFeedCron,
      handler: async () => {
        await dependencies.syncPopularFeed();
      },
    });
  }

  if (dependencies.tmdbCatalogExportCron && dependencies.reconcileCatalog) {
    jobs.push({
      id: "media-sync-tmdb-catalog-inventory",
      expression: dependencies.tmdbCatalogExportCron,
      handler: async () => {
        const now = (dependencies.clock ?? (() => new Date()))();
        await dependencies.reconcileCatalog?.(resolveExportDate(now));
      },
    });
  }

  if (dependencies.tmdbCatalogChangesCron && dependencies.discoverChanges) {
    jobs.push({
      id: "media-sync-tmdb-catalog-changes",
      expression: dependencies.tmdbCatalogChangesCron,
      handler: async () => {
        await dependencies.discoverChanges?.();
      },
    });
  }

  if (dependencies.tmdbCatalogWorkerCron && dependencies.processQueue) {
    jobs.push({
      id: "media-sync-tmdb-catalog-worker",
      expression: dependencies.tmdbCatalogWorkerCron,
      handler: async () => {
        await dependencies.processQueue?.();
      },
    });
  }

  return jobs;
}

function resolveExportDate(now: Date): string {
  const exportDate = new Date(now);
  if (exportDate.getUTCHours() < 8) {
    exportDate.setUTCDate(exportDate.getUTCDate() - 1);
  }
  return exportDate.toISOString().slice(0, 10);
}
