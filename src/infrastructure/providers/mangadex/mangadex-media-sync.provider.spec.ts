import { describe, expect, it, vi } from "vitest";

import type { SyncRequest } from "@application/media/dto/sync-request.dto.js";

import { MangadexMediaSyncProvider } from "./mangadex-media-sync.provider.js";

describe("MangadexMediaSyncProvider", () => {
  it("maps a MangaDex work response into a normalized aggregate", async () => {
    const request: SyncRequest = {
      provider: "mangadex",
      params: {
        target: "work",
        externalId: "abc-123",
        type: "manga"
      }
    };
    const client = {
      getWorkOrFeed: vi.fn().mockResolvedValue({
        data: {
          id: "abc-123",
          attributes: {
            year: 2024
          }
        }
      })
    };
    const provider = new MangadexMediaSyncProvider(client);

    const result = await provider.fetch(request);

    expect(result[0]).toEqual({
      source: {
        provider: "mangadex",
        sourceValue: "abc-123"
      },
      work: {
        type: "manga",
        releaseDate: "2024-01-01"
      }
    });
  });
});
