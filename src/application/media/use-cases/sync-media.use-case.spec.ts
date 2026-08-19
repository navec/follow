import { describe, expect, it, vi } from "vitest";

import { AuthorizationService } from "@auth-internal/application/services/authorization.service.js";
import type { User } from "@auth-internal/domain/entities/user.js";
import { AuthUnauthorizedError } from "@auth-internal/domain/errors/auth-errors.js";

import type { SyncRequest } from "../dto/sync-request.dto.js";
import type { SyncResult } from "../dto/sync-result.dto.js";
import type { MediaSyncProviderPort } from "../ports/out/media-sync-provider.port.js";
import type { MediaSyncRepositoryPort } from "../ports/out/media-sync-repository.port.js";

import { SyncMediaUseCase } from "./sync-media.use-case.js";

describe("SyncMediaUseCase", () => {
  it("delegates to the matching provider and persists normalized aggregates", async () => {
    const request: SyncRequest = {
      provider: "tmdb",
      params: {
        target: "work",
        externalId: 123,
        type: "movie"
      }
    };
    const actor: User = createUser({ role: "admin", permissions: ["media:write"] });
    const aggregates = [
      {
        source: {
          provider: "tmdb",
          sourceValue: "123"
        },
        work: {
          type: "movie"
        }
      }
    ];
    const provider: MediaSyncProviderPort = {
      supports: vi.fn().mockReturnValue(true),
      fetch: vi.fn().mockResolvedValue(aggregates)
    };
    const repository: MediaSyncRepositoryPort = {
      upsertMany: vi.fn().mockResolvedValue({
        created: 1,
        updated: 0,
        skipped: 0,
        errors: []
      } satisfies SyncResult)
    };
    const useCase = new SyncMediaUseCase(
      [provider],
      repository,
      new AuthorizationService()
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
        feed: "popular"
      }
    };
    const actor = createUser({ role: "admin", permissions: [] });
    const provider: MediaSyncProviderPort = {
      supports: vi.fn().mockReturnValue(true),
      fetch: vi.fn()
    };
    const repository: MediaSyncRepositoryPort = {
      upsertMany: vi.fn()
    };
    const useCase = new SyncMediaUseCase(
      [provider],
      repository,
      new AuthorizationService()
    );

    await expect(useCase.execute(request, actor)).rejects.toBeInstanceOf(
      AuthUnauthorizedError
    );
  });

  it("throws when no provider supports the request provider", async () => {
    const request: SyncRequest = {
      provider: "mangadex",
      params: {
        target: "work",
        externalId: "abc-123",
        type: "manga"
      }
    };
    const actor = createUser({ role: "admin", permissions: ["media:write"] });
    const provider: MediaSyncProviderPort = {
      supports: vi.fn().mockReturnValue(false),
      fetch: vi.fn()
    };
    const repository: MediaSyncRepositoryPort = {
      upsertMany: vi.fn()
    };
    const useCase = new SyncMediaUseCase(
      [provider],
      repository,
      new AuthorizationService()
    );

    await expect(useCase.execute(request, actor)).rejects.toThrow(
      "No media sync provider registered for mangadex"
    );
  });
});

function createUser(overrides: Partial<User>): User {
  return {
    id: "user-1",
    email: "admin@example.com",
    passwordHash: "hash",
    role: "user",
    permissions: [],
    createdAt: new Date("2026-03-10T00:00:00.000Z"),
    updatedAt: new Date("2026-03-10T00:00:00.000Z"),
    ...overrides
  };
}
