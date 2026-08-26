import { describe, expect, it, vi } from "vitest";

import { DiscoverTmdbMovieChangesUseCase } from "@media/application/use-cases/discover-tmdb-movie-changes.use-case.js";

const now = new Date("2026-08-25T12:00:00.000Z");

function createRepository(overrides: Record<string, unknown> = {}) {
  return {
    withJobLock: vi.fn(async (_key: string, task: () => Promise<unknown>) =>
      task(),
    ),
    getLastCompletedChangesAt: vi
      .fn()
      .mockResolvedValue(new Date("2026-08-20T08:00:00.000Z")),
    requestRefresh: vi.fn(),
    completeChangesWindow: vi.fn(),
    ...overrides,
  };
}

describe("DiscoverTmdbMovieChangesUseCase", () => {
  it("requests every page and sends each id once in repository batches", async () => {
    const source = {
      getChangedMovieIds: vi
        .fn()
        .mockResolvedValueOnce({ ids: [1, 2], page: 1, totalPages: 3 })
        .mockResolvedValueOnce({ ids: [2, 3], page: 2, totalPages: 3 })
        .mockResolvedValueOnce({ ids: [4], page: 3, totalPages: 3 }),
    };
    const repository = createRepository();
    const useCase = new DiscoverTmdbMovieChangesUseCase(
      source as never,
      repository as never,
      () => now,
      2,
    );

    await expect(useCase.execute()).resolves.toEqual({
      status: "completed",
      pages: 3,
      requested: 4,
      completedAt: now,
    });

    expect(source.getChangedMovieIds.mock.calls).toEqual([
      [{ startDate: "2026-08-19", endDate: "2026-08-25", page: 1 }],
      [{ startDate: "2026-08-19", endDate: "2026-08-25", page: 2 }],
      [{ startDate: "2026-08-19", endDate: "2026-08-25", page: 3 }],
    ]);
    expect(repository.requestRefresh.mock.calls).toEqual([
      [[1, 2], now],
      [[3, 4], now],
    ]);
    expect(repository.completeChangesWindow).toHaveBeenCalledWith(now);
    expect(repository.withJobLock).toHaveBeenCalledWith(
      "tmdb-catalog-changes",
      expect.any(Function),
    );
  });

  it("uses yesterday through today for the initial window", async () => {
    const source = {
      getChangedMovieIds: vi
        .fn()
        .mockResolvedValue({ ids: [], page: 1, totalPages: 1 }),
    };
    const repository = createRepository({
      getLastCompletedChangesAt: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new DiscoverTmdbMovieChangesUseCase(
      source as never,
      repository as never,
      () => now,
    );

    await useCase.execute();

    expect(source.getChangedMovieIds).toHaveBeenCalledWith({
      startDate: "2026-08-24",
      endDate: "2026-08-25",
      page: 1,
    });
  });

  it("caps catch-up windows at fourteen inclusive calendar days", async () => {
    const source = {
      getChangedMovieIds: vi
        .fn()
        .mockResolvedValue({ ids: [], page: 1, totalPages: 1 }),
    };
    const repository = createRepository({
      getLastCompletedChangesAt: vi
        .fn()
        .mockResolvedValue(new Date("2026-08-01T10:00:00.000Z")),
    });
    const useCase = new DiscoverTmdbMovieChangesUseCase(
      source as never,
      repository as never,
      () => now,
    );

    await useCase.execute();

    expect(source.getChangedMovieIds).toHaveBeenCalledWith({
      startDate: "2026-07-31",
      endDate: "2026-08-13",
      page: 1,
    });
    expect(repository.completeChangesWindow).toHaveBeenCalledWith(
      new Date("2026-08-13T23:59:59.999Z"),
    );
  });

  it("does not advance state when pagination fails", async () => {
    const source = {
      getChangedMovieIds: vi
        .fn()
        .mockResolvedValueOnce({ ids: [1], page: 1, totalPages: 2 })
        .mockRejectedValueOnce(new Error("page failed")),
    };
    const repository = createRepository();
    const useCase = new DiscoverTmdbMovieChangesUseCase(
      source as never,
      repository as never,
      () => now,
    );

    await expect(useCase.execute()).rejects.toThrow("page failed");
    expect(repository.completeChangesWindow).not.toHaveBeenCalled();
  });

  it("does not advance state when a refresh batch fails", async () => {
    const source = {
      getChangedMovieIds: vi
        .fn()
        .mockResolvedValue({ ids: [1, 2], page: 1, totalPages: 1 }),
    };
    const repository = createRepository({
      requestRefresh: vi.fn().mockRejectedValue(new Error("refresh failed")),
    });
    const useCase = new DiscoverTmdbMovieChangesUseCase(
      source as never,
      repository as never,
      () => now,
      2,
    );

    await expect(useCase.execute()).rejects.toThrow("refresh failed");
    expect(repository.completeChangesWindow).not.toHaveBeenCalled();
  });

  it("returns skipped when another process owns the lock", async () => {
    const source = { getChangedMovieIds: vi.fn() };
    const repository = createRepository({
      withJobLock: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new DiscoverTmdbMovieChangesUseCase(
      source as never,
      repository as never,
      () => now,
    );

    await expect(useCase.execute()).resolves.toEqual({ status: "skipped" });
    expect(repository.getLastCompletedChangesAt).not.toHaveBeenCalled();
    expect(source.getChangedMovieIds).not.toHaveBeenCalled();
  });
});
