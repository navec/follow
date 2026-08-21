import { describe, expect, it, vi } from "vitest";

import type { SyncRequest } from "@media/application/dto/sync-request.dto.js";
import type { SyncResult } from "@media/application/dto/sync-result.dto.js";
import type { MediaActor } from "@media/application/models/media-actor.js";
import type { MediaSyncProviderPort } from "@media/application/ports/out/media-sync-provider.port.js";
import type { MediaSyncRepositoryPort } from "@media/application/ports/out/media-sync-repository.port.js";
import { MediaAuthorizationPolicy } from "@media/application/services/media-authorization.policy.js";
import { SyncMediaUseCase } from "@media/application/use-cases/sync-media.use-case.js";
import { MediaForbiddenError } from "@media/public/index.js";

describe("SyncMediaUseCase", () => {
  it("delegates to the matching provider and persists normalized aggregates", async () => {
    const request: SyncRequest = {
      provider: "tmdb",
      params: {
        target: "work",
        externalId: 123,
        type: "movie",
      },
    };
    const actor = createActor({ role: "admin", permissions: ["media:write"] });
    const aggregates = [
      {
        source: {
          provider: "tmdb",
          sourceValue: "123",
        },
        work: {
          type: "movie",
        },
      },
    ];
    const provider: MediaSyncProviderPort = {
      supports: vi.fn().mockReturnValue(true),
      fetch: vi.fn().mockResolvedValue(aggregates),
    };
    const repository: MediaSyncRepositoryPort = {
      upsertMany: vi.fn().mockResolvedValue({
        created: 1,
        updated: 0,
        skipped: 0,
        errors: [],
      } satisfies SyncResult),
    };
    const useCase = new SyncMediaUseCase(
      [provider],
      repository,
      new MediaAuthorizationPolicy(),
    );

    await useCase.execute(request, actor);

    expect(provider.fetch).toHaveBeenCalledWith(request);
    expect(repository.upsertMany).toHaveBeenCalledWith(aggregates);
  });

  it("rejects actors without media write permission", async () => {
    const request: SyncRequest = {
      provider: "tmdb",
      params: {
        target: "feed",
        feed: "popular",
      },
    };
    const actor = createActor({ role: "admin", permissions: [] });
    const provider: MediaSyncProviderPort = {
      supports: vi.fn().mockReturnValue(true),
      fetch: vi.fn(),
    };
    const repository: MediaSyncRepositoryPort = {
      upsertMany: vi.fn(),
    };
    const useCase = new SyncMediaUseCase(
      [provider],
      repository,
      new MediaAuthorizationPolicy(),
    );

    await expect(useCase.execute(request, actor)).rejects.toBeInstanceOf(
      MediaForbiddenError,
    );
  });

  it("throws when no provider supports the request provider", async () => {
    const request: SyncRequest = {
      provider: "mangadex",
      params: {
        target: "work",
        externalId: "abc-123",
        type: "manga",
      },
    };
    const actor = createActor({ role: "admin", permissions: ["media:write"] });
    const provider: MediaSyncProviderPort = {
      supports: vi.fn().mockReturnValue(false),
      fetch: vi.fn(),
    };
    const repository: MediaSyncRepositoryPort = {
      upsertMany: vi.fn(),
    };
    const useCase = new SyncMediaUseCase(
      [provider],
      repository,
      new MediaAuthorizationPolicy(),
    );

    await expect(useCase.execute(request, actor)).rejects.toThrow(
      "No media sync provider registered for mangadex",
    );
  });
});

function createActor(overrides: Partial<MediaActor>): MediaActor {
  return {
    id: "user-1",
    role: "user",
    permissions: [],
    ...overrides,
  };
}
