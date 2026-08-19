import { describe, expect, it, vi } from "vitest";

import type { BodyValidator } from "../../shared/http/validation/validator.js";

import type { MediaSyncProviderPort } from "./application/ports/out/media-sync-provider.port.js";
import type { MediaSyncRepositoryPort } from "./application/ports/out/media-sync-repository.port.js";
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
    const bodyValidator: BodyValidator = {
      parse: vi.fn((_schema, input) => input) as BodyValidator["parse"],
    };
    const media = createMediaModule({
      providers: [provider],
      repository,
      http: { bodyValidator },
      scheduler: { tmdbFeedCron: "0 * * * *" },
    });
    const command = {
      provider: "tmdb" as const,
      params: { target: "feed" as const, feed: "popular" },
    };
    const actor = {
      id: "admin-1",
      role: "admin",
      permissions: ["media:write"],
    };

    await media.api.sync(command, actor);

    expect(provider.fetch).toHaveBeenCalledWith(command);
    expect(repository.upsertMany).toHaveBeenCalledWith([]);
    expect(media.http).toMatchObject({
      id: "media",
      basePath: "/media",
      routes: [
        { method: "POST", path: "/sync", access: "authenticated" },
      ],
    });
    expect(media.scheduledJobs).toMatchObject([
      { id: "media-sync-tmdb-feed", expression: "0 * * * *" },
    ]);
  });
});
