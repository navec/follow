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

  it("normalizes status and keeps every titled movie translation", async () => {
    const client = {
      getWork: vi.fn().mockResolvedValue({
        id: 550,
        status: "Released",
        title: "Fight Club",
        original_title: "Fight Club",
        original_language: "en",
        translations: {
          translations: [
            {
              iso_639_1: "fr",
              iso_3166_1: "FR",
              data: {
                title: "",
                overview: "Synopsis français",
                tagline: "Règle un",
              },
            },
            {
              iso_639_1: "en",
              iso_3166_1: "US",
              data: {
                title: "",
                overview: "English overview",
                tagline: "Soap.",
              },
            },
            {
              iso_639_1: "es",
              iso_3166_1: "ES",
              data: {
                title: "El club de la lucha",
                overview: "Resumen",
              },
            },
          ],
        },
      }),
      getPopularMovies: vi.fn(),
      getPopularTv: vi.fn(),
    };
    const provider = new TmdbMediaSyncProvider(client, {
      defaultLocale: "fr-FR",
    });

    const [aggregate] = await provider.fetch({
      provider: "tmdb",
      params: { target: "work", externalId: 550, type: "movie" },
    });

    expect(aggregate?.work.statusCode).toBe("released");
    expect(aggregate?.translations).toEqual([
      {
        localeCode: "fr-FR",
        language: "fr",
        title: "Fight Club",
        summary: "Synopsis français",
        tagline: "Règle un",
      },
      {
        localeCode: "en-US",
        language: "en",
        title: "Fight Club",
        summary: "English overview",
        tagline: "Soap.",
      },
      {
        localeCode: "es-ES",
        language: "es",
        title: "El club de la lucha",
        summary: "Resumen",
      },
    ]);
  });

  it("normalizes compound statuses and skips unrelated title-less translations", async () => {
    const client = {
      getWork: vi.fn().mockResolvedValue({
        id: 550,
        status: " Post Production ",
        title: "Fight Club",
        original_title: "Fight Club",
        original_language: "en",
        translations: {
          translations: [
            {
              iso_639_1: "de",
              iso_3166_1: "DE",
              data: { title: "", overview: "Zusammenfassung" },
            },
          ],
        },
      }),
      getPopularMovies: vi.fn(),
      getPopularTv: vi.fn(),
    };
    const provider = new TmdbMediaSyncProvider(client, {
      defaultLocale: "fr-FR",
    });

    const [aggregate] = await provider.fetch({
      provider: "tmdb",
      params: { target: "work", externalId: 550, type: "movie" },
    });

    expect(aggregate?.work.statusCode).toBe("post_production");
    expect(aggregate?.translations).toBeUndefined();
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
        images: {
          posters: [
            { file_path: "/poster.jpg", iso_639_1: "fr" },
            { file_path: "/poster-en.jpg", iso_639_1: "en" },
            { file_path: "/poster.jpg", iso_639_1: "fr" },
          ],
          backdrops: [
            { file_path: "/backdrop.jpg", iso_639_1: null },
            { file_path: "/backdrop-en.jpg", iso_639_1: "en" },
          ],
        },
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
              profile_path: "/brad-pitt.jpg",
            },
            {
              id: 819,
              name: "Edward Norton",
              character: "The Narrator",
              profile_path: null,
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
    const provider = new TmdbMediaSyncProvider(client, {
      defaultLocale: "fr-FR",
    });

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
          {
            localeCode: "de-DE",
            language: "de",
            title: "Fight Club",
          },
        ],
        images: [
          {
            type: "poster",
            sourceValue: "/poster.jpg",
            url: "https://image.tmdb.org/t/p/original/poster.jpg",
            localeCode: "fr-FR",
            language: "fr",
          },
          {
            type: "poster",
            sourceValue: "/poster-en.jpg",
            url: "https://image.tmdb.org/t/p/original/poster-en.jpg",
            localeCode: "en-US",
            language: "en",
          },
          {
            type: "backdrop",
            sourceValue: "/backdrop.jpg",
            url: "https://image.tmdb.org/t/p/original/backdrop.jpg",
          },
          {
            type: "backdrop",
            sourceValue: "/backdrop-en.jpg",
            url: "https://image.tmdb.org/t/p/original/backdrop-en.jpg",
            localeCode: "en-US",
            language: "en",
          },
        ],
        contributors: [
          {
            sourceValue: "287",
            name: "Brad Pitt",
            role: "actor",
            characterName: "Tyler Durden",
            profileImage: {
              type: "profile",
              sourceValue: "/brad-pitt.jpg",
              url: "https://image.tmdb.org/t/p/original/brad-pitt.jpg",
            },
          },
          {
            sourceValue: "819",
            name: "Edward Norton",
            role: "actor",
            characterName: "The Narrator",
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
