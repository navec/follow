import type { SyncRequest } from "../../../application/dto/sync-request.dto.js";
import type { MediaSyncProviderPort } from "../../../application/ports/out/media-sync-provider.port.js";
import type { NormalizedWorkAggregate } from "../../../domain/models/normalized-work-aggregate.js";

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
  first_air_date?: string;
}

interface TmdbClient {
  getWork(request: TmdbWorkSyncRequest): Promise<TmdbWorkPayload>;
  getPopularMovies(): Promise<{ results: TmdbWorkPayload[] }>;
  getPopularTv(): Promise<{ results: TmdbWorkPayload[] }>;
}

export class TmdbMediaSyncProvider implements MediaSyncProviderPort {
  constructor(private readonly client: TmdbClient) {}

  supports(provider: SyncRequest["provider"]): boolean {
    return provider === "tmdb";
  }

  async fetch(request: SyncRequest): Promise<ReadonlyArray<NormalizedWorkAggregate>> {
    if (request.provider !== "tmdb") {
      throw new Error("TMDB provider supports only tmdb requests");
    }

    if (request.params.target === "work") {
      const payload = await this.client.getWork(request as TmdbWorkSyncRequest);
      return [this.toAggregate(payload, this.normalizeWorkType(request.params.type))];
    }

    if (request.params.target === "feed" && request.params.feed === "popular") {
      const [movies, tvShows] = await Promise.all([
        this.client.getPopularMovies(),
        this.client.getPopularTv(),
      ]);

      return [
        ...movies.results.map((payload) => this.toAggregate(payload, "movie")),
        ...tvShows.results.map((payload) =>
          this.toAggregate(payload, this.normalizeWorkType("tv")),
        ),
      ];
    }

    throw new Error(`Unsupported TMDB sync target: ${request.params.target}`);
  }

  private toAggregate(
    payload: TmdbWorkPayload,
    type: string,
  ): NormalizedWorkAggregate {
    const work: NormalizedWorkAggregate["work"] = { type };
    if (payload.release_date) {
      work.releaseDate = payload.release_date;
    } else if (payload.first_air_date) {
      work.releaseDate = payload.first_air_date;
    }

    return {
      source: {
        provider: "tmdb",
        sourceValue: String(payload.id),
      },
      work,
    };
  }

  private normalizeWorkType(type: string): string {
    if (type === "tv") {
      return "series";
    }

    return type;
  }
}
