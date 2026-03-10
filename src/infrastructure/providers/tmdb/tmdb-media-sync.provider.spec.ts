import { describe, expect, it, vi } from "vitest";

import type { SyncRequest } from "@application/media/dto/sync-request.dto.js";

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
      })
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
});
