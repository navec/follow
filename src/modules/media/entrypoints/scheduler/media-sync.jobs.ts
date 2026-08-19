import type { ScheduledJobDefinition } from "../../../../shared/scheduling/scheduled-job-definition.js";
import type { MediaActor, MediaApi } from "../../public/media-api.js";

interface MediaSyncJobsDependencies {
  api: MediaApi;
  tmdbFeedCron?: string | undefined;
}

const systemActor: MediaActor = {
  id: "system-media-sync",
  role: "admin",
  permissions: ["media:write"],
};

export function createMediaSyncJobs({
  api,
  tmdbFeedCron,
}: MediaSyncJobsDependencies): ReadonlyArray<ScheduledJobDefinition> {
  if (!tmdbFeedCron) {
    return [];
  }

  return [
    {
      id: "media-sync-tmdb-feed",
      expression: tmdbFeedCron,
      handler: async () => {
        await api.sync(
          {
            provider: "tmdb",
            params: { target: "feed", feed: "popular" },
          },
          systemActor,
        );
      },
    },
  ];
}
