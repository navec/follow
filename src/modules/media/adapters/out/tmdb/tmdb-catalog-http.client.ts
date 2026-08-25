import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

import type {
  TmdbChangePage,
  TmdbInventoryMovie,
} from "@media/application/models/tmdb-catalog-sync.js";
import type { TmdbCatalogSourcePort } from "@media/application/ports/out/tmdb-catalog-source.port.js";

interface TmdbCatalogHttpClientOptions {
  baseUrl: string;
  exportBaseUrl: string;
  readAccessToken: string;
  requestTimeoutMs: number;
  fetchImpl?: typeof fetch;
}

interface TmdbChangesPayload {
  page: number;
  total_pages: number;
  results: Array<{ id: number }>;
}

export class TmdbCatalogHttpClient implements TmdbCatalogSourcePort {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: TmdbCatalogHttpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getChangedMovieIds(input: {
    startDate: string;
    endDate: string;
    page: number;
  }): Promise<TmdbChangePage> {
    const baseUrl = this.options.baseUrl.endsWith("/")
      ? this.options.baseUrl
      : `${this.options.baseUrl}/`;
    const url = new URL("movie/changes", baseUrl);
    url.searchParams.set("start_date", input.startDate);
    url.searchParams.set("end_date", input.endDate);
    url.searchParams.set("page", String(input.page));

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
        throw new Error(`TMDB changes request failed: ${response.status}`);
      }

      const payload = (await response.json()) as TmdbChangesPayload;
      return {
        ids: payload.results
          .map(({ id }) => id)
          .filter((id) => Number.isSafeInteger(id) && id > 0),
        page: payload.page,
        totalPages: payload.total_pages,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async *streamMovieInventory(
    exportDate: string,
  ): AsyncIterable<TmdbInventoryMovie> {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(exportDate);
    if (!match) {
      throw new Error(`Invalid TMDB export date: ${exportDate}`);
    }

    const [, year, month, day] = match;
    const filename = `movie_ids_${month}_${day}_${year}.json.gz`;
    const baseUrl = this.options.exportBaseUrl.endsWith("/")
      ? this.options.exportBaseUrl
      : `${this.options.exportBaseUrl}/`;
    const url = new URL(filename, baseUrl);
    const response = await this.fetchImpl(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`TMDB export request failed: ${response.status}`);
    }
    if (!response.body) {
      throw new Error("TMDB export response body is missing");
    }

    const decompressed = Readable.fromWeb(response.body).pipe(createGunzip());
    const lines = createInterface({
      input: decompressed,
      crlfDelay: Infinity,
    });

    for await (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(line) as unknown;
      } catch {
        throw new Error("Invalid TMDB export JSON");
      }

      if (typeof payload !== "object" || payload === null) {
        throw new Error("Invalid TMDB export row");
      }
      const movie = payload as Record<string, unknown>;
      if (movie.adult !== false || movie.video !== false) {
        continue;
      }
      if (!Number.isSafeInteger(movie.id) || Number(movie.id) <= 0) {
        throw new Error("Invalid TMDB export movie id");
      }
      if (
        typeof movie.popularity !== "number" ||
        !Number.isFinite(movie.popularity) ||
        movie.popularity < 0
      ) {
        throw new Error("Invalid TMDB export popularity");
      }

      yield {
        tmdbId: movie.id as number,
        popularity: movie.popularity,
      };
    }
  }
}
