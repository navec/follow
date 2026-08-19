import { describe, expect, it, vi } from "vitest";

import type { MediaSyncProviderPort } from "@media-internal/application/ports/out/media-sync-provider.port.js";
import type { MediaSyncRepositoryPort } from "@media-internal/application/ports/out/media-sync-repository.port.js";

import { createMediaModule } from "./media.module.js";

describe("createMediaModule", () => {
  it("exposes a public facade that delegates media synchronization", async () => {
    const provider: MediaSyncProviderPort = {
      supports: vi.fn().mockReturnValue(true),
      fetch: vi.fn().mockResolvedValue([]),
    };
    const repository: MediaSyncRepositoryPort = {
      upsertMany: vi.fn().mockResolvedValue({
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [],
      }),
    };
    const mediaApi = createMediaModule({ providers: [provider], repository });
    const command = {
      provider: "tmdb" as const,
      params: { target: "feed" as const, feed: "popular" },
    };
    const actor = {
      id: "admin-1",
      role: "admin",
      permissions: ["media:write"],
    };

    await mediaApi.sync(command, actor);

    expect(provider.fetch).toHaveBeenCalledWith(command);
    expect(repository.upsertMany).toHaveBeenCalledWith([]);
  });
});
