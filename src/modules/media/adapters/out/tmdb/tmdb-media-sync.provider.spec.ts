import { describe, expect, it, vi } from "vitest";

import type { SyncRequest } from "../../../application/dto/sync-request.dto.js";

import { TmdbMediaSyncProvider } from "./tmdb-media-sync.provider.js";

describe("TmdbMediaSyncProvider", () => {
  it("maps a TMDB work response into a normalized aggregate", async () => {
    const request: SyncRequest = {
      provider: "tmdb",
      params: {
        target: "work",
        externalId: 123,
        type: "movie"
      }
    };
    const client = {
      getWork: vi.fn().mockResolvedValue({
        id: 123,
        media_type: "movie",
        release_date: "2026-03-10"
      }),
      getPopularMovies: vi.fn(),
      getPopularTv: vi.fn(),
    };
    const provider = new TmdbMediaSyncProvider(client);

    const result = await provider.fetch(request);

    expect(result[0]).toEqual({
      source: {
        provider: "tmdb",
        sourceValue: "123"
      },
      work: {
        type: "movie",
        releaseDate: "2026-03-10"
      }
    });
  });

  it("maps a TV first air date into the internal release date", async () => {
    const request: SyncRequest = {
      provider: "tmdb",
      params: {
        target: "work",
        externalId: 1399,
        type: "tv"
      }
    };
    const client = {
      getWork: vi.fn().mockResolvedValue({
        id: 1399,
        first_air_date: "2011-04-17"
      }),
      getPopularMovies: vi.fn(),
      getPopularTv: vi.fn(),
    };
    const provider = new TmdbMediaSyncProvider(client);

    const result = await provider.fetch(request);

    expect(result[0]).toEqual({
      source: {
        provider: "tmdb",
        sourceValue: "1399"
      },
      work: {
        type: "series",
        releaseDate: "2011-04-17"
      }
    });
  });

  it("maps the popular feed to movies and tv aggregates", async () => {
    const request: SyncRequest = {
      provider: "tmdb",
      params: {
        target: "feed",
        feed: "popular",
      },
    };
    const client = {
      getWork: vi.fn(),
      getPopularMovies: vi.fn().mockResolvedValue({
        results: [{ id: 11, release_date: "1977-05-25" }],
      }),
      getPopularTv: vi.fn().mockResolvedValue({
        results: [{ id: 1399, first_air_date: "2011-04-17" }],
      }),
    };
    const provider = new TmdbMediaSyncProvider(client);

    const result = await provider.fetch(request);

    expect(result).toEqual([
      {
        source: {
          provider: "tmdb",
          sourceValue: "11",
        },
        work: {
          type: "movie",
          releaseDate: "1977-05-25",
        },
      },
      {
        source: {
          provider: "tmdb",
          sourceValue: "1399",
        },
        work: {
          type: "series",
          releaseDate: "2011-04-17",
        },
      },
    ]);
  });
});
