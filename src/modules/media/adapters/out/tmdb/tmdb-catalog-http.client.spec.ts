import { gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { TmdbCatalogHttpClient } from "@media/adapters/out/tmdb/tmdb-catalog-http.client.js";

function streamResponse(
  chunks: ReadonlyArray<Uint8Array>,
  status = 200,
): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    { status },
  );
}

async function collectInventory(
  client: TmdbCatalogHttpClient,
  exportDate = "2026-08-24",
) {
  const movies = [];
  for await (const movie of client.streamMovieInventory(exportDate)) {
    movies.push(movie);
  }
  return movies;
}

function createClient(fetchImpl: typeof fetch) {
  return new TmdbCatalogHttpClient({
    baseUrl: "https://api.themoviedb.org/3",
    exportBaseUrl: "https://files.tmdb.org/p/exports",
    readAccessToken: "tmdb-token",
    requestTimeoutMs: 5000,
    fetchImpl,
  });
}

describe("TmdbCatalogHttpClient", () => {
  it("streams split export chunks and emits only eligible movies", async () => {
    const compressed = gzipSync(
      [
        JSON.stringify({
          adult: false,
          id: 11,
          popularity: 98.5,
          video: false,
        }),
        JSON.stringify({
          adult: true,
          id: 12,
          popularity: 97,
          video: false,
        }),
        JSON.stringify({
          adult: false,
          id: 13,
          popularity: 96,
          video: true,
        }),
        JSON.stringify({
          adult: false,
          id: 14,
          popularity: 95,
          video: false,
        }),
      ].join("\n"),
    );
    const fetchImpl = vi.fn().mockResolvedValue(
      streamResponse([
        compressed.subarray(0, 7),
        compressed.subarray(7, 19),
        compressed.subarray(19),
      ]),
    );

    await expect(collectInventory(createClient(fetchImpl))).resolves.toEqual([
      { tmdbId: 11, popularity: 98.5 },
      { tmdbId: 14, popularity: 95 },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://files.tmdb.org/p/exports/movie_ids_08_24_2026.json.gz",
      }),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects invalid JSON", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(streamResponse([gzipSync("{invalid-json")]));

    await expect(collectInventory(createClient(fetchImpl))).rejects.toThrow(
      "Invalid TMDB export JSON",
    );
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid TMDB id %s",
    async (id) => {
      const payload = JSON.stringify({
        adult: false,
        id,
        popularity: 10,
        video: false,
      });
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(streamResponse([gzipSync(payload)]));

      await expect(collectInventory(createClient(fetchImpl))).rejects.toThrow(
        "Invalid TMDB export movie id",
      );
    },
  );

  it("rejects negative popularity", async () => {
    const payload = JSON.stringify({
      adult: false,
      id: 11,
      popularity: -0.1,
      video: false,
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(streamResponse([gzipSync(payload)]));

    await expect(collectInventory(createClient(fetchImpl))).rejects.toThrow(
      "Invalid TMDB export popularity",
    );
  });

  it("rejects non-successful export responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse([], 503));

    await expect(collectInventory(createClient(fetchImpl))).rejects.toThrow(
      "TMDB export request failed: 503",
    );
  });

  it("rejects truncated gzip data", async () => {
    const compressed = gzipSync(
      JSON.stringify({
        adult: false,
        id: 11,
        popularity: 10,
        video: false,
      }),
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        streamResponse([compressed.subarray(0, compressed.length - 8)]),
      );

    await expect(collectInventory(createClient(fetchImpl))).rejects.toThrow();
  });

  it("requests and maps one authenticated movie change page", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        page: 2,
        total_pages: 4,
        results: [
          { id: 11 },
          { id: 0 },
          { id: 12.5 },
          { id: Number.MAX_SAFE_INTEGER + 1 },
          { id: 14 },
        ],
      }),
    });
    const client = createClient(fetchImpl);

    await expect(
      client.getChangedMovieIds({
        startDate: "2026-08-18",
        endDate: "2026-08-24",
        page: 2,
      }),
    ).resolves.toEqual({ ids: [11, 14], page: 2, totalPages: 4 });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://api.themoviedb.org/3/movie/changes?start_date=2026-08-18&end_date=2026-08-24&page=2",
      }),
      expect.objectContaining({
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: "Bearer tmdb-token",
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("aborts a change request after the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      async (_url: URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );
    const client = new TmdbCatalogHttpClient({
      baseUrl: "https://api.themoviedb.org/3",
      exportBaseUrl: "https://files.tmdb.org/p/exports",
      readAccessToken: "tmdb-token",
      requestTimeoutMs: 50,
      fetchImpl: fetchImpl as never,
    });

    const request = client.getChangedMovieIds({
      startDate: "2026-08-18",
      endDate: "2026-08-24",
      page: 1,
    });
    const rejection = expect(request).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(50);

    await rejection;
    vi.useRealTimers();
  });
});
