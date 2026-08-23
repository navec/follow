interface TmdbHttpClientOptions {
  baseUrl: string;
  readAccessToken: string;
  defaultLanguage: string;
  defaultRegion: string;
  imageBaseUrl: string;
  requestTimeoutMs: number;
  fetchImpl?: typeof fetch;
}

interface TmdbMoviePayload {
  id: number;
  status?: string;
  title?: string;
  overview?: string;
  tagline?: string;
  release_date?: string;
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

interface TmdbTvPayload {
  id: number;
  first_air_date?: string;
}

interface TmdbListResponse<TItem> {
  results: TItem[];
}

type TmdbWorkPayload = TmdbMoviePayload | TmdbTvPayload;

type TmdbWorkSyncRequest = {
  provider: "tmdb";
  params: {
    target: "work";
    externalId: number | string;
    type: string;
  };
};

export class TmdbHttpClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: TmdbHttpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getWork(request: TmdbWorkSyncRequest): Promise<TmdbWorkPayload> {
    const path = this.resolvePath(request.params.type, request.params.externalId);
    const url = new URL(path, this.options.baseUrl.endsWith("/")
      ? this.options.baseUrl
      : `${this.options.baseUrl}/`);
    url.searchParams.set("language", this.options.defaultLanguage);
    if (request.params.type === "movie") {
      url.searchParams.set("region", this.options.defaultRegion);
      url.searchParams.set("append_to_response", "translations,credits,images");
      url.searchParams.set("include_image_language", "fr,en,null");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.options.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${this.options.readAccessToken}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`TMDB request failed: ${response.status}`);
      }

      return (await response.json()) as TmdbWorkPayload;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getPopularMovies(): Promise<TmdbListResponse<TmdbMoviePayload>> {
    return this.getList<TmdbMoviePayload>("movie/popular", true);
  }

  async getPopularTv(): Promise<TmdbListResponse<TmdbTvPayload>> {
    return this.getList<TmdbTvPayload>("tv/popular", false);
  }

  getImageUrl(filePath: string): string {
    return `${this.options.imageBaseUrl.replace(/\/$/, "")}/${filePath.replace(/^\//, "")}`;
  }

  private resolvePath(type: string, externalId: number | string): string {
    if (type === "movie") {
      return `movie/${externalId}`;
    }

    if (type === "tv") {
      return `tv/${externalId}`;
    }

    throw new Error(`Unsupported TMDB work type: ${type}`);
  }

  private async getList<TItem>(
    path: string,
    includeRegion: boolean,
  ): Promise<TmdbListResponse<TItem>> {
    const url = new URL(
      path,
      this.options.baseUrl.endsWith("/")
        ? this.options.baseUrl
        : `${this.options.baseUrl}/`,
    );
    url.searchParams.set("language", this.options.defaultLanguage);
    if (includeRegion) {
      url.searchParams.set("region", this.options.defaultRegion);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.options.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${this.options.readAccessToken}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`TMDB request failed: ${response.status}`);
      }

      return (await response.json()) as TmdbListResponse<TItem>;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
