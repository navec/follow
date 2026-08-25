import { describe, expect, it, vi } from "vitest";

import { PgTmdbCatalogSyncRepository } from "@media/adapters/out/postgres/pg-tmdb-catalog-sync.repository.js";

describe("PgTmdbCatalogSyncRepository", () => {
  it("stages a parameterized batch and updates popularity on conflict", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 2 }),
      connect: vi.fn(),
    };
    const repository = new PgTmdbCatalogSyncRepository(pool as never);

    await repository.stageInventoryBatch("2026-08-24", [
      { tmdbId: 550, popularity: 91.5 },
      { tmdbId: 680, popularity: 73 },
    ]);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = pool.query.mock.calls[0] as unknown as [
      string,
      unknown[],
    ];
    expect(sql).toContain("VALUES ($1, $2, $3), ($1, $4, $5)");
    expect(sql).toContain("ON CONFLICT (export_date, tmdb_id)");
    expect(sql).toContain("popularity = EXCLUDED.popularity");
    expect(values).toEqual(["2026-08-24", 550, 91.5, 680, 73]);
  });

  it("reconciles counts, state, and stage in one ordered transaction", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("FILTER") && sql.includes("AS inserted")) {
          return { rows: [{ inserted: "2", updated: "1" }], rowCount: 1 };
        }
        if (sql.includes("consecutive_export_misses + 1")) {
          return { rows: [], rowCount: 3 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const repository = new PgTmdbCatalogSyncRepository({
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn(),
    } as never);

    await expect(repository.reconcileInventory("2026-08-24")).resolves.toEqual(
      { inserted: 2, updated: 1, missing: 3 },
    );

    const mergeIndex = queries.findIndex(
      (sql) =>
        sql.includes("INSERT INTO tmdb_movie_sync_queue") &&
        sql.includes("ON CONFLICT"),
    );
    const missesIndex = queries.findIndex((sql) =>
      sql.includes("consecutive_export_misses + 1"),
    );
    const stateIndex = queries.findIndex((sql) =>
      sql.includes("UPDATE tmdb_catalog_sync_state"),
    );
    const cleanupIndex = queries.findIndex((sql) =>
      sql.includes("DELETE FROM tmdb_movie_inventory_staging"),
    );
    expect(queries[0]).toBe("BEGIN");
    expect(mergeIndex).toBeGreaterThan(0);
    expect(missesIndex).toBeGreaterThan(mergeIndex);
    expect(stateIndex).toBeGreaterThan(missesIndex);
    expect(cleanupIndex).toBeGreaterThan(stateIndex);
    expect(queries.at(-1)).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("does not increment misses when reconciliation fails", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("FILTER") && sql.includes("AS inserted")) {
          return { rows: [{ inserted: "1", updated: "0" }], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO tmdb_movie_sync_queue")) {
          throw new Error("merge failed");
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const repository = new PgTmdbCatalogSyncRepository({
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn(),
    } as never);

    await expect(
      repository.reconcileInventory("2026-08-24"),
    ).rejects.toThrow("merge failed");

    expect(queries).toContain("ROLLBACK");
    expect(
      queries.some((sql) => sql.includes("consecutive_export_misses + 1")),
    ).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("returns undefined without running the task when the job lock is held", async () => {
    const task = vi.fn();
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ acquired: false }], rowCount: 1 }),
      release: vi.fn(),
    };
    const repository = new PgTmdbCatalogSyncRepository({
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn(),
    } as never);

    await expect(repository.withJobLock("inventory", task)).resolves.toBe(
      undefined,
    );
    expect(task).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("unlocks and releases the client when a locked task fails", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ acquired: true }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ unlocked: true }], rowCount: 1 }),
      release: vi.fn(),
    };
    const repository = new PgTmdbCatalogSyncRepository({
      connect: vi.fn().mockResolvedValue(client),
      query: vi.fn(),
    } as never);

    await expect(
      repository.withJobLock("inventory", async () => {
        throw new Error("task failed");
      }),
    ).rejects.toThrow("task failed");

    expect(client.query).toHaveBeenLastCalledWith(
      expect.stringContaining("pg_advisory_unlock"),
      ["inventory"],
    );
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("reads the last completed change timestamp", async () => {
    const completedAt = new Date("2026-08-24T12:00:00.000Z");
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ last_completed_changes_at: completedAt }],
        rowCount: 1,
      }),
      connect: vi.fn(),
    };
    const repository = new PgTmdbCatalogSyncRepository(pool as never);

    await expect(repository.getLastCompletedChangesAt()).resolves.toEqual(
      completedAt,
    );
  });

  it("requests refresh only for active known inventory rows", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 2 }),
      connect: vi.fn(),
    };
    const repository = new PgTmdbCatalogSyncRepository(pool as never);
    const requestedAt = new Date("2026-08-25T12:00:00.000Z");

    await repository.requestRefresh([11, 14], requestedAt);

    const [sql, values] = pool.query.mock.calls[0] as unknown as [
      string,
      unknown[],
    ];
    expect(sql).toContain("tmdb_id = ANY($1::bigint[])");
    expect(sql).toContain("consecutive_export_misses < 2");
    expect(sql).toContain("WHEN status = 'processing' THEN status");
    expect(sql).toContain("ELSE 'pending'");
    expect(sql).toContain("next_attempt_at = CASE");
    expect(sql).toContain("refresh_requested_at = $2");
    expect(values).toEqual([[11, 14], requestedAt]);
  });

  it("records a completed changes window", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
      connect: vi.fn(),
    };
    const repository = new PgTmdbCatalogSyncRepository(pool as never);
    const completedAt = new Date("2026-08-25T12:00:00.000Z");

    await repository.completeChangesWindow(completedAt);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("last_completed_changes_at = $1"),
      [completedAt],
    );
  });
});
