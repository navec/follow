import type { SyncProvider } from "@application/media/dto/sync-request.dto.js";
import type { MediaSyncProviderPort } from "@application/media/ports/out/media-sync-provider.port.js";

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
