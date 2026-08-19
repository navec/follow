import type { MediaSyncProviderPort } from "./application/ports/out/media-sync-provider.port.js";
import type { MediaSyncRepositoryPort } from "./application/ports/out/media-sync-repository.port.js";
import { MediaAuthorizationPolicy } from "./application/services/media-authorization.policy.js";
import { SyncMediaUseCase } from "./application/use-cases/sync-media.use-case.js";
import type { MediaApi } from "./public/media-api.js";

interface MediaModuleDependencies {
  providers: ReadonlyArray<MediaSyncProviderPort>;
  repository: MediaSyncRepositoryPort;
}

export function createMediaModule({
  providers,
  repository,
}: MediaModuleDependencies): MediaApi {
  const syncMedia = new SyncMediaUseCase(
    providers,
    repository,
    new MediaAuthorizationPolicy(),
  );

  return {
    sync: (command, actor) => syncMedia.execute(command, actor),
  };
}
