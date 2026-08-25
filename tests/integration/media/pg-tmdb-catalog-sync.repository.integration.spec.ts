import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  getTestDatabaseUrl,
  migrateTestDbUpOnce,
  truncateTestTables,
} from "@tests/integration/helpers/test-db.js";

describe("TMDB catalog sync schema integration", () => {
  const pool = new Pool({ connectionString: getTestDatabaseUrl() });

  beforeAll(async () => {
    await migrateTestDbUpOnce();
  });

  beforeEach(async () => {
    await truncateTestTables(pool, [
      "tmdb_movie_sync_queue",
      "tmdb_movie_inventory_staging",
    ]);
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
});
