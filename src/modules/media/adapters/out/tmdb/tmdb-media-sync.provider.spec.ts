import { describe, expect, it, vi } from "vitest";

import { TmdbMediaSyncProvider } from "@media/adapters/out/tmdb/tmdb-media-sync.provider.js";
import type { SyncRequest } from "@media/application/dto/sync-request.dto.js";

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

  it("maps targeted movie catalog details into an enriched aggregate", async () => {
    const client = {
      getWork: vi.fn().mockResolvedValue({
        id: 550,
        release_date: "1999-10-15",
        original_title: "Fight Club",
        original_language: "en",
        poster_path: "/poster.jpg",
        backdrop_path: "/backdrop.jpg",
        translations: {
          translations: [
            {
              iso_639_1: "fr",
              iso_3166_1: "FR",
              data: {
                title: "Fight Club",
                overview: "Synopsis français",
                tagline: "Première règle du Fight Club",
              },
            },
            {
              iso_639_1: "en",
              iso_3166_1: "US",
              data: {
                title: "Fight Club",
                overview: "English overview",
                tagline: "Mischief. Mayhem. Soap.",
              },
            },
            {
              iso_639_1: "de",
              iso_3166_1: "DE",
              data: { title: "Fight Club" },
            },
          ],
        },
        credits: {
          cast: [
            {
              id: 287,
              name: "Brad Pitt",
              character: "Tyler Durden",
            },
          ],
          crew: [
            { id: 7467, name: "David Fincher", job: "Director" },
            { id: 7468, name: "Jim Uhls", job: "Screenplay" },
          ],
        },
      }),
      getPopularMovies: vi.fn(),
      getPopularTv: vi.fn(),
      getImageUrl: vi.fn(
        (path: string) => `https://image.tmdb.org/t/p/original${path}`,
      ),
    };
    const provider = new TmdbMediaSyncProvider(client);

    const result = await provider.fetch({
      provider: "tmdb",
      params: { target: "work", externalId: 550, type: "movie" },
    });

    expect(result).toEqual([
      {
        source: { provider: "tmdb", sourceValue: "550" },
        work: {
          type: "movie",
          releaseDate: "1999-10-15",
          originalTitle: "Fight Club",
          originalLanguage: "en",
        },
        translations: [
          {
            localeCode: "fr-FR",
            language: "fr",
            title: "Fight Club",
            summary: "Synopsis français",
            tagline: "Première règle du Fight Club",
          },
          {
            localeCode: "en-US",
            language: "en",
            title: "Fight Club",
            summary: "English overview",
            tagline: "Mischief. Mayhem. Soap.",
          },
        ],
        images: [
          {
            type: "poster",
            sourceValue: "/poster.jpg",
            url: "https://image.tmdb.org/t/p/original/poster.jpg",
          },
          {
            type: "backdrop",
            sourceValue: "/backdrop.jpg",
            url: "https://image.tmdb.org/t/p/original/backdrop.jpg",
          },
        ],
        contributors: [
          {
            sourceValue: "287",
            name: "Brad Pitt",
            role: "actor",
            characterName: "Tyler Durden",
          },
          {
            sourceValue: "7467",
            name: "David Fincher",
            role: "director",
          },
        ],
      },
    ]);
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
