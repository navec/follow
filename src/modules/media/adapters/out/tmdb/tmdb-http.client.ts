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

export class TmdbHttpError extends Error {
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(
    message: string,
    status?: number,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = "TmdbHttpError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

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

    return this.requestJson<TmdbWorkPayload>(url);
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

    return this.requestJson<TmdbListResponse<TItem>>(url);
  }

  private async requestJson<TResult>(url: URL): Promise<TResult> {
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
        throw new TmdbHttpError(
          `TMDB request failed: ${response.status}`,
          response.status,
          parseRetryAfterMs(response.headers.get("Retry-After")),
        );
      }

      return (await response.json()) as TResult;
    } catch (error) {
      if (error instanceof TmdbHttpError) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new TmdbHttpError("TMDB request timed out");
      }
      throw new TmdbHttpError("TMDB request failed");
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }

  return Number(value) * 1000;
}
