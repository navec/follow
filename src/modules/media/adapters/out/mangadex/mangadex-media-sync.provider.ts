import type { SyncRequest } from "@media-internal/application/dto/sync-request.dto.js";
import type { MediaSyncProviderPort } from "@media-internal/application/ports/out/media-sync-provider.port.js";
import type { NormalizedWorkAggregate } from "@media-internal/domain/models/normalized-work-aggregate.js";

type MangadexWorkSyncRequest = {
  provider: "mangadex";
  params: {
    target: "work";
    externalId: number | string;
    type: string;
  };
};

interface MangadexPayload {
  data: {
    id: string;
    attributes?: {
      year?: number;
    };
  };
}

interface MangadexClient {
  getWorkOrFeed(request: MangadexWorkSyncRequest): Promise<MangadexPayload>;
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

    const payload = await this.client.getWorkOrFeed(request as MangadexWorkSyncRequest);
    const year = payload.data.attributes?.year;
    const work: NormalizedWorkAggregate["work"] = {
      type: request.params.type
    };
    if (year) {
      work.releaseDate = `${year}-01-01`;
    }

    return [
      {
        source: {
          provider: "mangadex",
          sourceValue: payload.data.id
        },
        work
      }
    ];
  }
}
