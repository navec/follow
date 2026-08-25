import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PgTmdbCatalogSyncRepository } from "@media/adapters/out/postgres/pg-tmdb-catalog-sync.repository.js";
import {
  getTestDatabaseUrl,
  migrateTestDbUpOnce,
  truncateTestTables,
} from "@tests/integration/helpers/test-db.js";

describe("TMDB catalog sync schema integration", () => {
  const pool = new Pool({ connectionString: getTestDatabaseUrl() });
  const repository = new PgTmdbCatalogSyncRepository(pool);

  beforeAll(async () => {
    await migrateTestDbUpOnce();
  });

  beforeEach(async () => {
    await truncateTestTables(pool, [
      "tmdb_movie_sync_queue",
      "tmdb_movie_inventory_staging",
    ]);
    await pool.query(
      `UPDATE tmdb_catalog_sync_state
       SET last_completed_export_date = NULL,
           last_completed_changes_at = NULL,
           updated_at = NOW()`,
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates the durable catalog synchronization tables", async () => {
    await expect(
      pool.query("SELECT * FROM tmdb_movie_sync_queue LIMIT 0"),
    ).resolves.toBeDefined();
    await expect(
      pool.query("SELECT * FROM tmdb_movie_inventory_staging LIMIT 0"),
    ).resolves.toBeDefined();
    await expect(
      pool.query("SELECT * FROM tmdb_catalog_sync_state LIMIT 0"),
    ).resolves.toBeDefined();
  });

  it("rejects duplicate TMDB ids and unsupported queue statuses", async () => {
    const insertQueueRow = (tmdbId: number, status = "pending") =>
      pool.query(
        `INSERT INTO tmdb_movie_sync_queue
           (tmdb_id, popularity, status, last_seen_export_date)
         VALUES ($1, $2, $3, $4)`,
        [tmdbId, 42.5, status, "2026-08-24"],
      );

    await insertQueueRow(550);

    await expect(insertQueueRow(550)).rejects.toMatchObject({ code: "23505" });
    await expect(insertQueueRow(551, "unsupported")).rejects.toMatchObject({
      code: "23514",
    });
  });

  it("upserts staged popularity and can reset one export", async () => {
    await repository.stageInventoryBatch("2026-08-24", [
      { tmdbId: 550, popularity: 10 },
    ]);
    await repository.stageInventoryBatch("2026-08-24", [
      { tmdbId: 550, popularity: 99.5 },
    ]);

    const staged = await pool.query(
      `SELECT tmdb_id::int AS tmdb_id, popularity
       FROM tmdb_movie_inventory_staging`,
    );
    expect(staged.rows).toEqual([{ tmdb_id: 550, popularity: 99.5 }]);

    await repository.resetInventoryStage("2026-08-24");
    await expect(
      pool.query("SELECT COUNT(*)::int AS count FROM tmdb_movie_inventory_staging"),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it("merges a complete inventory without requeueing completed movies", async () => {
    await pool.query(
      `INSERT INTO tmdb_movie_sync_queue
         (tmdb_id, popularity, status, last_seen_export_date,
          consecutive_export_misses)
       VALUES
         (10, 1, 'completed', '2026-08-23', 3),
         (20, 2, 'completed', '2026-08-23', 0)`,
    );
    await repository.stageInventoryBatch("2026-08-24", [
      { tmdbId: 10, popularity: 99 },
      { tmdbId: 30, popularity: 88 },
    ]);

    await expect(repository.reconcileInventory("2026-08-24")).resolves.toEqual(
      { inserted: 1, updated: 1, missing: 1 },
    );

    const queue = await pool.query(
      `SELECT tmdb_id::int AS tmdb_id,
              popularity,
              status,
              last_seen_export_date::text AS last_seen_export_date,
              consecutive_export_misses
       FROM tmdb_movie_sync_queue
       ORDER BY tmdb_id`,
    );
    expect(queue.rows).toEqual([
      {
        tmdb_id: 10,
        popularity: 99,
        status: "completed",
        last_seen_export_date: "2026-08-24",
        consecutive_export_misses: 0,
      },
      {
        tmdb_id: 20,
        popularity: 2,
        status: "completed",
        last_seen_export_date: "2026-08-23",
        consecutive_export_misses: 1,
      },
      {
        tmdb_id: 30,
        popularity: 88,
        status: "pending",
        last_seen_export_date: "2026-08-24",
        consecutive_export_misses: 0,
      },
    ]);
    await expect(
      pool.query(
        `SELECT last_completed_export_date::text AS last_completed_export_date
         FROM tmdb_catalog_sync_state`,
      ),
    ).resolves.toMatchObject({
      rows: [{ last_completed_export_date: "2026-08-24" }],
    });
    await expect(
      pool.query("SELECT COUNT(*)::int AS count FROM tmdb_movie_inventory_staging"),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });
});
