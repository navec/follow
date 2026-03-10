import type { SyncRequest } from "@application/media/dto/sync-request.dto.js";
import type { NormalizedWorkAggregate } from "@application/media/models/normalized-work-aggregate.js";
import type { MediaSyncProviderPort } from "@application/media/ports/out/media-sync-provider.port.js";

type TmdbWorkSyncRequest = {
  provider: "tmdb";
  params: {
    target: "work";
    externalId: number | string;
    type: string;
  };
};

interface TmdbWorkPayload {
  id: number;
  media_type?: string;
  release_date?: string;
}

interface TmdbClient {
  getWork(request: TmdbWorkSyncRequest): Promise<TmdbWorkPayload>;
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

    const payload = await this.client.getWork(request as TmdbWorkSyncRequest);
    const work: NormalizedWorkAggregate["work"] = {
      type: request.params.type
    };
    if (payload.release_date) {
      work.releaseDate = payload.release_date;
    }

    return [
      {
        source: {
          provider: "tmdb",
          sourceValue: String(payload.id)
        },
        work
      }
    ];
  }
}
