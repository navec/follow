import { describe, expect, it, vi } from "vitest";

import { ReconcileTmdbMovieCatalogUseCase } from "@media/application/use-cases/reconcile-tmdb-movie-catalog.use-case.js";

describe("ReconcileTmdbMovieCatalogUseCase", () => {
  it("locks, resets, stages configured batches, then reconciles the supplied date", async () => {
    const events: string[] = [];
    const movies = [
      { tmdbId: 1, popularity: 50 },
      { tmdbId: 2, popularity: 40 },
      { tmdbId: 3, popularity: 30 },
      { tmdbId: 4, popularity: 20 },
      { tmdbId: 5, popularity: 10 },
    ];
    const source = {
      streamMovieInventory: vi.fn(async function* (exportDate: string) {
        events.push(`stream:${exportDate}:start`);
        for (const movie of movies) {
          yield movie;
        }
        events.push("stream:complete");
      }),
    };
    const repository = {
      withJobLock: vi.fn(async (_key: string, task: () => Promise<unknown>) =>
        task(),
      ),
      resetInventoryStage: vi.fn(async () => {
        events.push("reset");
      }),
      stageInventoryBatch: vi.fn(async () => {
        events.push("stage");
      }),
      reconcileInventory: vi.fn(async () => {
        events.push("reconcile");
        return { inserted: 3, updated: 2, missing: 1 };
      }),
    };
    const useCase = new ReconcileTmdbMovieCatalogUseCase(
      source as never,
      repository as never,
      2,
    );

    await expect(useCase.execute("2026-08-24")).resolves.toEqual({
      status: "completed",
      inserted: 3,
      updated: 2,
      missing: 1,
    });

    expect(repository.withJobLock).toHaveBeenCalledWith(
      "tmdb-catalog-inventory",
      expect.any(Function),
    );
    expect(source.streamMovieInventory).toHaveBeenCalledWith("2026-08-24");
    expect(repository.resetInventoryStage).toHaveBeenCalledWith("2026-08-24");
    expect(repository.stageInventoryBatch.mock.calls).toEqual([
      ["2026-08-24", movies.slice(0, 2)],
      ["2026-08-24", movies.slice(2, 4)],
      ["2026-08-24", movies.slice(4)],
    ]);
    expect(events).toEqual([
      "reset",
      "stream:2026-08-24:start",
      "stage",
      "stage",
      "stream:complete",
      "stage",
      "reconcile",
    ]);
  });

  it("never reconciles an incomplete export stream", async () => {
    const source = {
      streamMovieInventory: vi.fn(async function* () {
        yield { tmdbId: 1, popularity: 10 };
        throw new Error("export interrupted");
      }),
    };
    const repository = {
      withJobLock: vi.fn(async (_key: string, task: () => Promise<unknown>) =>
        task(),
      ),
      resetInventoryStage: vi.fn(),
      stageInventoryBatch: vi.fn(),
      reconcileInventory: vi.fn(),
    };
    const useCase = new ReconcileTmdbMovieCatalogUseCase(
      source as never,
      repository as never,
      1,
    );

    await expect(useCase.execute("2026-08-24")).rejects.toThrow(
      "export interrupted",
    );
    expect(repository.stageInventoryBatch).toHaveBeenCalledOnce();
    expect(repository.reconcileInventory).not.toHaveBeenCalled();
  });

  it("returns skipped without touching staging when the lock is held", async () => {
    const source = { streamMovieInventory: vi.fn() };
    const repository = {
      withJobLock: vi.fn().mockResolvedValue(undefined),
      resetInventoryStage: vi.fn(),
      stageInventoryBatch: vi.fn(),
      reconcileInventory: vi.fn(),
    };
    const useCase = new ReconcileTmdbMovieCatalogUseCase(
      source as never,
      repository as never,
      2,
    );

    await expect(useCase.execute("2026-08-24")).resolves.toEqual({
      status: "skipped",
    });
    expect(repository.resetInventoryStage).not.toHaveBeenCalled();
    expect(source.streamMovieInventory).not.toHaveBeenCalled();
  });

  it("uses a default staging batch size of one thousand", async () => {
    const movies = Array.from({ length: 1001 }, (_, index) => ({
      tmdbId: index + 1,
      popularity: 1001 - index,
    }));
    const source = {
      streamMovieInventory: vi.fn(async function* () {
        yield* movies;
      }),
    };
    const repository = {
      withJobLock: vi.fn(async (_key: string, task: () => Promise<unknown>) =>
        task(),
      ),
      resetInventoryStage: vi.fn(),
      stageInventoryBatch: vi.fn(),
      reconcileInventory: vi
        .fn()
        .mockResolvedValue({ inserted: 1001, updated: 0, missing: 0 }),
    };
    const useCase = new ReconcileTmdbMovieCatalogUseCase(
      source as never,
      repository as never,
    );

    await useCase.execute("2026-08-24");

    expect(repository.stageInventoryBatch.mock.calls[0]?.[1]).toHaveLength(
      1000,
    );
    expect(repository.stageInventoryBatch.mock.calls[1]?.[1]).toHaveLength(1);
  });
});
