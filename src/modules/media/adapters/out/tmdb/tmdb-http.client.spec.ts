import { describe, expect, it, vi } from "vitest";

import { TmdbHttpClient } from "@media/adapters/out/tmdb/tmdb-http.client.js";

describe("TmdbHttpClient", () => {
  it("calls movie details with bearer auth and localized params", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: 11,
        status: "Released",
        title: "La Guerre des étoiles",
        overview: "Il y a bien longtemps...",
        tagline: "Que la Force soit avec vous.",
        release_date: "1977-05-25",
        images: {
          posters: [{ file_path: "/poster.jpg", iso_639_1: "fr" }],
          backdrops: [{ file_path: "/backdrop.jpg", iso_639_1: null }],
        },
        credits: {
          cast: [
            {
              id: 1,
              name: "Mark Hamill",
              character: "Luke Skywalker",
              profile_path: "/mark-hamill.jpg",
            },
          ],
          crew: [],
        },
      }),
    });
    const client = new TmdbHttpClient({
      baseUrl: "https://api.themoviedb.org/3",
      readAccessToken: "tmdb-token",
      defaultLanguage: "fr-FR",
      defaultRegion: "FR",
      imageBaseUrl: "https://image.tmdb.org/t/p/original",
      requestTimeoutMs: 5000,
      fetchImpl: fetchImpl as never,
    });

    const result = await client.getWork({
      provider: "tmdb",
      params: {
        target: "work",
        externalId: 11,
        type: "movie",
      },
    });

    expect(result).toEqual({
      id: 11,
      status: "Released",
      title: "La Guerre des étoiles",
      overview: "Il y a bien longtemps...",
      tagline: "Que la Force soit avec vous.",
      release_date: "1977-05-25",
      images: {
        posters: [{ file_path: "/poster.jpg", iso_639_1: "fr" }],
        backdrops: [{ file_path: "/backdrop.jpg", iso_639_1: null }],
      },
      credits: {
        cast: [
          {
            id: 1,
            name: "Mark Hamill",
            character: "Luke Skywalker",
            profile_path: "/mark-hamill.jpg",
          },
        ],
        crew: [],
      },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://api.themoviedb.org/3/movie/11?language=fr-FR&region=FR&append_to_response=translations%2Ccredits%2Cimages&include_image_language=fr%2Cen%2Cnull",
      }),
      expect.objectContaining({
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: "Bearer tmdb-token",
        },
      }),
    );
  });

  it("calls tv details without forcing region", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: 1399,
        first_air_date: "2011-04-17",
      }),
    });
    const client = new TmdbHttpClient({
      baseUrl: "https://api.themoviedb.org/3",
      readAccessToken: "tmdb-token",
      defaultLanguage: "fr-FR",
      defaultRegion: "FR",
      imageBaseUrl: "https://image.tmdb.org/t/p/original",
      requestTimeoutMs: 5000,
      fetchImpl: fetchImpl as never,
    });

    await client.getWork({
      provider: "tmdb",
      params: {
        target: "work",
        externalId: 1399,
        type: "tv",
      },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://api.themoviedb.org/3/tv/1399?language=fr-FR",
      }),
      expect.any(Object),
    );
  });

  it("calls popular movie and tv list endpoints", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ id: 11, release_date: "1977-05-25" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ id: 1399, first_air_date: "2011-04-17" }],
        }),
      });
    const client = new TmdbHttpClient({
      baseUrl: "https://api.themoviedb.org/3",
      readAccessToken: "tmdb-token",
      defaultLanguage: "fr-FR",
      defaultRegion: "FR",
      imageBaseUrl: "https://image.tmdb.org/t/p/original",
      requestTimeoutMs: 5000,
      fetchImpl: fetchImpl as never,
    });

    await client.getPopularMovies();
    await client.getPopularTv();

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        href: "https://api.themoviedb.org/3/movie/popular?language=fr-FR&region=FR",
      }),
      expect.any(Object),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        href: "https://api.themoviedb.org/3/tv/popular?language=fr-FR",
      }),
      expect.any(Object),
    );
  });

  it("builds an original TMDB image URL from its source path", () => {
    const client = new TmdbHttpClient({
      baseUrl: "https://api.themoviedb.org/3",
      readAccessToken: "tmdb-token",
      defaultLanguage: "fr-FR",
      defaultRegion: "FR",
      imageBaseUrl: "https://image.tmdb.org/t/p/original",
      requestTimeoutMs: 5000,
      fetchImpl: vi.fn() as never,
    });

    expect(client.getImageUrl("/poster.jpg")).toBe(
      "https://image.tmdb.org/t/p/original/poster.jpg",
    );
  });
});
