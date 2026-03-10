import type { SyncRequest } from "@application/media/dto/sync-request.dto.js";
import type { NormalizedWorkAggregate } from "@application/media/models/normalized-work-aggregate.js";
import type { MediaSyncProviderPort } from "@application/media/ports/out/media-sync-provider.port.js";

interface MangadexPayload {
  data: {
    id: string;
    attributes?: {
      year?: number;
    };
  };
}

interface MangadexClient {
  getWorkOrFeed(request: SyncRequest): Promise<MangadexPayload>;
}

export class MangadexMediaSyncProvider implements MediaSyncProviderPort {
  constructor(private readonly client: MangadexClient) {}

  supports(provider: SyncRequest["provider"]): boolean {
    return provider === "mangadex";
  }

  async fetch(request: SyncRequest): Promise<ReadonlyArray<NormalizedWorkAggregate>> {
    if (request.provider !== "mangadex" || request.params.target !== "work") {
      throw new Error("MangaDex provider currently supports only targeted work sync");
    }

    const payload = await this.client.getWorkOrFeed(request);
    const year = payload.data.attributes?.year;

    return [
      {
        source: {
          provider: "mangadex",
          sourceValue: payload.data.id
        },
        work: {
          type: request.params.type,
          releaseDate: year ? `${year}-01-01` : undefined
        }
      }
    ];
  }
}
