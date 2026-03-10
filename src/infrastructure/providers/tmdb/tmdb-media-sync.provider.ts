import type { SyncRequest } from "@application/media/dto/sync-request.dto.js";
import type { NormalizedWorkAggregate } from "@application/media/models/normalized-work-aggregate.js";
import type { MediaSyncProviderPort } from "@application/media/ports/out/media-sync-provider.port.js";

interface TmdbWorkPayload {
  id: number;
  media_type?: string;
  release_date?: string;
}

interface TmdbClient {
  getWork(request: Extract<SyncRequest, { provider: "tmdb"; params: { target: "work" } }>): Promise<TmdbWorkPayload>;
}

export class TmdbMediaSyncProvider implements MediaSyncProviderPort {
  constructor(private readonly client: TmdbClient) {}

  supports(provider: SyncRequest["provider"]): boolean {
    return provider === "tmdb";
  }

  async fetch(request: SyncRequest): Promise<ReadonlyArray<NormalizedWorkAggregate>> {
    if (request.provider !== "tmdb" || request.params.target !== "work") {
      throw new Error("TMDB provider currently supports only targeted work sync");
    }

    const payload = await this.client.getWork(request);

    return [
      {
        source: {
          provider: "tmdb",
          sourceValue: String(payload.id)
        },
        work: {
          type: request.params.type,
          releaseDate: payload.release_date
        }
      }
    ];
  }
}
