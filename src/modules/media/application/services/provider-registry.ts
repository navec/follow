import type { SyncProvider } from "@media-internal/application/dto/sync-request.dto.js";
import type { MediaSyncProviderPort } from "@media-internal/application/ports/out/media-sync-provider.port.js";

export class MediaSyncProviderRegistry {
  constructor(private readonly providers: ReadonlyArray<MediaSyncProviderPort>) {}

  get(provider: SyncProvider): MediaSyncProviderPort {
    const match = this.providers.find((entry) => entry.supports(provider));
    if (!match) {
      throw new Error(`No media sync provider registered for ${provider}`);
    }

    return match;
  }
}
