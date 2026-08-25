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
    exportBaseUrl: "https://files.tmdb.org/p/exports",
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
});
