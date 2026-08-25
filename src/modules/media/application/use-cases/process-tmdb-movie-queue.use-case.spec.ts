import { afterEach, describe, expect, it, vi } from "vitest";

import { TmdbHttpError } from "@media/adapters/out/tmdb/tmdb-http.client.js";
import type { SyncResult } from "@media/application/dto/sync-result.dto.js";
import { ProcessTmdbMovieQueueUseCase } from "@media/application/use-cases/process-tmdb-movie-queue.use-case.js";

const now = new Date("2026-08-25T12:00:00.000Z");

function success(): SyncResult {
  return { created: 1, updated: 0, skipped: 0, errors: [] };
}

function options(overrides: Record<string, number> = {}) {
  return {
    batchSize: 10,
    leaseSeconds: 300,
    requestsPerSecond: 5,
    concurrency: 2,
    maxAttempts: 8,
    retryBaseMs: 1000,
    retryMaxMs: 6000,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ProcessTmdbMovieQueueUseCase", () => {
  it("recovers leases, claims a bounded batch, and isolates movie failures", async () => {
    const events: string[] = [];
    const claims = [
      { tmdbId: 1, popularity: 30, attempts: 1, claimedAt: now },
      { tmdbId: 2, popularity: 20, attempts: 1, claimedAt: now },
      { tmdbId: 3, popularity: 10, attempts: 1, claimedAt: now },
    ];
    const repository = {
      requeueExpiredLeases: vi.fn(async () => {
        events.push("recover");
        return 1;
      }),
      claimBatch: vi.fn(async () => {
        events.push("claim");
        return claims;
      }),
      completeMovie: vi.fn(),
      retryMovie: vi.fn(),
      markMovieUnavailable: vi.fn(),
    };
    const syncMovie = vi.fn(async (tmdbId: number): Promise<SyncResult> => {
      events.push(`sync:${tmdbId}`);
      if (tmdbId === 2) {
        return {
          created: 0,
          updated: 0,
          skipped: 0,
          errors: [{ code: "PERSISTENCE_ERROR", message: "failed" }],
        };
      }
      return success();
    });
    const useCase = new ProcessTmdbMovieQueueUseCase(
      repository as never,
      syncMovie,
      options({ concurrency: 1 }),
      () => now,
      vi.fn().mockResolvedValue(undefined),
      () => 0,
    );

    await expect(useCase.execute()).resolves.toEqual({
      claimed: 3,
      completed: 2,
      retried: 1,
      unavailable: 0,
    });

    expect(events.slice(0, 2)).toEqual(["recover", "claim"]);
    expect(repository.requeueExpiredLeases).toHaveBeenCalledWith(now);
    expect(repository.claimBatch).toHaveBeenCalledWith({
      limit: 10,
      now,
      leaseUntil: new Date("2026-08-25T12:05:00.000Z"),
    });
    expect(repository.completeMovie.mock.calls).toEqual([
      [1, now, now],
      [3, now, now],
    ]);
    expect(repository.retryMovie).toHaveBeenCalledWith({
      tmdbId: 2,
      error: "PERSISTENCE_ERROR: failed",
      nextAttemptAt: new Date("2026-08-25T12:00:01.000Z"),
      maxAttempts: 8,
    });
    expect(syncMovie).toHaveBeenCalledTimes(3);
  });

  it("spaces request starts while respecting configured concurrency", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const claims = Array.from({ length: 4 }, (_, index) => ({
      tmdbId: index + 1,
      popularity: 4 - index,
      attempts: 1,
      claimedAt: now,
    }));
    const repository = {
      requeueExpiredLeases: vi.fn().mockResolvedValue(0),
      claimBatch: vi.fn().mockResolvedValue(claims),
      completeMovie: vi.fn(),
      retryMovie: vi.fn(),
      markMovieUnavailable: vi.fn(),
    };
    const starts: number[] = [];
    let active = 0;
    let maximumActive = 0;
    const syncMovie = vi.fn(async () => {
      starts.push(Date.now());
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 500));
      active -= 1;
      return success();
    });
    const delay = (delayMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    const useCase = new ProcessTmdbMovieQueueUseCase(
      repository as never,
      syncMovie,
      options({ requestsPerSecond: 5, concurrency: 2 }),
      () => new Date(Date.now()),
      delay,
      () => 0,
    );

    const execution = useCase.execute();
    await vi.runAllTimersAsync();
    await execution;

    expect(maximumActive).toBeLessThanOrEqual(2);
    expect(starts).toHaveLength(4);
    for (let index = 1; index < starts.length; index += 1) {
      expect(starts[index]! - starts[index - 1]!).toBeGreaterThanOrEqual(200);
    }
  });

  it("uses retry-after or bounded exponential backoff plus jitter", async () => {
    const claims = [
      { tmdbId: 1, popularity: 30, attempts: 2, claimedAt: now },
      { tmdbId: 2, popularity: 20, attempts: 3, claimedAt: now },
      { tmdbId: 3, popularity: 10, attempts: 4, claimedAt: now },
    ];
    const repository = {
      requeueExpiredLeases: vi.fn().mockResolvedValue(0),
      claimBatch: vi.fn().mockResolvedValue(claims),
      completeMovie: vi.fn(),
      retryMovie: vi.fn(),
      markMovieUnavailable: vi.fn(),
    };
    const syncMovie = vi.fn(async (tmdbId: number): Promise<SyncResult> => {
      if (tmdbId === 1) {
        throw new TmdbHttpError("rate limited", 429, 5000);
      }
      if (tmdbId === 2) {
        throw new TmdbHttpError("TMDB request timed out");
      }
      throw new TmdbHttpError("TMDB request failed: 503", 503);
    });
    const useCase = new ProcessTmdbMovieQueueUseCase(
      repository as never,
      syncMovie,
      options({ concurrency: 1, requestsPerSecond: 1000 }),
      () => now,
      vi.fn().mockResolvedValue(undefined),
      () => 250,
    );

    await useCase.execute();

    expect(repository.retryMovie.mock.calls).toEqual([
      [
        {
          tmdbId: 1,
          error: "rate limited",
          nextAttemptAt: new Date("2026-08-25T12:00:05.000Z"),
          maxAttempts: 8,
        },
      ],
      [
        {
          tmdbId: 2,
          error: "TMDB request timed out",
          nextAttemptAt: new Date("2026-08-25T12:00:04.250Z"),
          maxAttempts: 8,
        },
      ],
      [
        {
          tmdbId: 3,
          error: "TMDB request failed: 503",
          nextAttemptAt: new Date("2026-08-25T12:00:06.000Z"),
          maxAttempts: 8,
        },
      ],
    ]);
  });

  it("marks 404 responses unavailable without retrying", async () => {
    const claim = { tmdbId: 404, popularity: 1, attempts: 1, claimedAt: now };
    const repository = {
      requeueExpiredLeases: vi.fn().mockResolvedValue(0),
      claimBatch: vi.fn().mockResolvedValue([claim]),
      completeMovie: vi.fn(),
      retryMovie: vi.fn(),
      markMovieUnavailable: vi.fn(),
    };
    const useCase = new ProcessTmdbMovieQueueUseCase(
      repository as never,
      vi.fn().mockRejectedValue(new TmdbHttpError("not found", 404)),
      options(),
      () => now,
      vi.fn().mockResolvedValue(undefined),
      () => 0,
    );

    await expect(useCase.execute()).resolves.toMatchObject({ unavailable: 1 });
    expect(repository.markMovieUnavailable).toHaveBeenCalledWith(
      404,
      "not found",
    );
    expect(repository.retryMovie).not.toHaveBeenCalled();
  });
});
