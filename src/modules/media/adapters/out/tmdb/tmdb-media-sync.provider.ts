import type { SyncRequest } from "@media/application/dto/sync-request.dto.js";
import type { MediaSyncProviderPort } from "@media/application/ports/out/media-sync-provider.port.js";
import type {
  NormalizedWorkAggregate,
  NormalizedWorkContributor,
  NormalizedWorkImage,
  NormalizedWorkTranslation,
} from "@media/domain/models/normalized-work-aggregate.js";

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
  status?: string;
  title?: string;
  overview?: string;
  tagline?: string;
  release_date?: string;
  first_air_date?: string;
  original_title?: string;
  original_language?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  images?: {
    posters: Array<{ file_path: string; iso_639_1: string | null }>;
    backdrops: Array<{ file_path: string; iso_639_1: string | null }>;
  };
  translations?: {
    translations: Array<{
      iso_639_1: string;
      iso_3166_1: string;
      data: {
        title?: string;
        overview?: string;
        tagline?: string;
      };
    }>;
  };
  credits?: {
    cast: Array<{
      id: number;
      name: string;
      character?: string;
      profile_path?: string | null;
    }>;
    crew: Array<{
      id: number;
      name: string;
      job?: string;
    }>;
  };
}

interface TmdbClient {
  getWork(request: TmdbWorkSyncRequest): Promise<TmdbWorkPayload>;
  getPopularMovies(): Promise<{ results: TmdbWorkPayload[] }>;
  getPopularTv(): Promise<{ results: TmdbWorkPayload[] }>;
  getImageUrl?(filePath: string): string;
}

interface TmdbMediaSyncProviderOptions {
  defaultLocale?: string;
}

export class TmdbMediaSyncProvider implements MediaSyncProviderPort {
  constructor(
    private readonly client: TmdbClient,
    private readonly options: TmdbMediaSyncProviderOptions = {},
  ) {}

  supports(provider: SyncRequest["provider"]): boolean {
    return provider === "tmdb";
  }

  async fetch(
    request: SyncRequest,
  ): Promise<ReadonlyArray<NormalizedWorkAggregate>> {
    if (request.provider !== "tmdb") {
      throw new Error("TMDB provider supports only tmdb requests");
    }

    if (request.params.target === "work") {
      const payload = await this.client.getWork(request as TmdbWorkSyncRequest);
      return [
        this.toAggregate(payload, this.normalizeWorkType(request.params.type)),
      ];
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

    if (payload.original_title) {
      work.originalTitle = payload.original_title;
    }
    if (payload.original_language) {
      work.originalLanguage = payload.original_language;
    }
    const statusCode = this.normalizeStatus(payload.status);
    if (statusCode) {
      work.statusCode = statusCode;
    }

    const aggregate: NormalizedWorkAggregate = {
      source: {
        provider: "tmdb",
        sourceValue: String(payload.id),
      },
      work,
    };

    const translations = this.mapTranslations(payload);
    if (translations.length > 0) {
      aggregate.translations = translations;
    }

    const images = this.mapImages(payload);
    if (images.length > 0) {
      aggregate.images = images;
    }

    const contributors = this.mapContributors(payload);
    if (contributors.length > 0) {
      aggregate.contributors = contributors;
    }

    return aggregate;
  }

  private mapTranslations(
    payload: TmdbWorkPayload,
  ): NormalizedWorkTranslation[] {
    return (payload.translations?.translations ?? []).flatMap((translation) => {
      const localeCode = `${translation.iso_639_1}-${translation.iso_3166_1}`;
      const title =
        translation.data.title?.trim() ||
        (localeCode === this.options.defaultLocale
          ? payload.title?.trim()
          : undefined) ||
        (translation.iso_639_1 === payload.original_language
          ? payload.original_title?.trim()
          : undefined);
      if (!title) {
        return [];
      }

      const normalized: NormalizedWorkTranslation = {
        localeCode,
        language: translation.iso_639_1,
        title,
      };
      if (translation.data.overview?.trim()) {
        normalized.summary = translation.data.overview;
      }
      if (translation.data.tagline?.trim()) {
        normalized.tagline = translation.data.tagline;
      }
      return [normalized];
    });
  }

  private mapImages(payload: TmdbWorkPayload): NormalizedWorkImage[] {
    if (!this.client.getImageUrl) {
      return [];
    }

    const images: NormalizedWorkImage[] = [];
    const seenPaths = new Set<string>();
    const galleries = [
      ...(payload.images?.posters ?? []).map((image) => ({
        ...image,
        type: "poster" as const,
      })),
      ...(payload.images?.backdrops ?? []).map((image) => ({
        ...image,
        type: "backdrop" as const,
      })),
    ];

    for (const image of galleries) {
      if (seenPaths.has(image.file_path)) {
        continue;
      }
      seenPaths.add(image.file_path);

      const normalized: NormalizedWorkImage = {
        type: image.type,
        sourceValue: image.file_path,
        url: this.client.getImageUrl(image.file_path),
      };
      const locale = this.mapImageLocale(image.iso_639_1);
      if (locale) {
        normalized.localeCode = locale.localeCode;
        normalized.language = locale.language;
      }
      images.push(normalized);
    }
    return images;
  }

  private mapContributors(
    payload: TmdbWorkPayload,
  ): NormalizedWorkContributor[] {
    const actors = (payload.credits?.cast ?? []).map((person) => {
      const actor: NormalizedWorkContributor = {
        sourceValue: String(person.id),
        name: person.name,
        role: "actor",
      };
      if (person.character?.trim()) {
        actor.characterName = person.character;
      }
      if (person.profile_path && this.client.getImageUrl) {
        actor.profileImage = {
          type: "profile",
          sourceValue: person.profile_path,
          url: this.client.getImageUrl(person.profile_path),
        };
      }
      return actor;
    });
    return actors;
  }

  private mapImageLocale(
    language: string | null,
  ): { localeCode: string; language: string } | undefined {
    if (language === "fr") {
      return { localeCode: "fr-FR", language };
    }
    if (language === "en") {
      return { localeCode: "en-US", language };
    }
    return undefined;
  }

  private normalizeStatus(status: string | undefined): string | undefined {
    const normalized = status
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return normalized || undefined;
  }

  private normalizeWorkType(type: string): string {
    if (type === "tv") {
      return "series";
    }

    return type;
  }
}
