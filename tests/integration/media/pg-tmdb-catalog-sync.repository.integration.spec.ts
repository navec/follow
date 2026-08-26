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

  it("ignores replayed or older inventory dates without adding misses or regressing state", async () => {
    await pool.query(
      `INSERT INTO tmdb_movie_sync_queue
         (tmdb_id, popularity, status, last_seen_export_date,
          consecutive_export_misses)
       VALUES (10, 1, 'completed', '2026-08-24', 1)`,
    );
    await pool.query(
      `UPDATE tmdb_catalog_sync_state
       SET last_completed_export_date = '2026-08-24'`,
    );

    for (const exportDate of ["2026-08-24", "2026-08-23"]) {
      await repository.stageInventoryBatch(exportDate, [
        { tmdbId: 20, popularity: 99 },
      ]);
      await expect(repository.reconcileInventory(exportDate)).resolves.toEqual({
        inserted: 0,
        updated: 0,
        missing: 0,
      });
    }

    await expect(
      pool.query(
        `SELECT tmdb_id::int AS tmdb_id, popularity,
                last_seen_export_date::text AS last_seen_export_date,
                consecutive_export_misses
         FROM tmdb_movie_sync_queue
         ORDER BY tmdb_id`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          tmdb_id: 10,
          popularity: 1,
          last_seen_export_date: "2026-08-24",
          consecutive_export_misses: 1,
        },
      ],
    });
    await expect(
      pool.query(
        `SELECT last_completed_export_date::text AS last_completed_export_date
         FROM tmdb_catalog_sync_state`,
      ),
    ).resolves.toMatchObject({
      rows: [{ last_completed_export_date: "2026-08-24" }],
    });
  });

  it("claims only eligible rows and applies completion, retry, and terminal outcomes", async () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const leaseUntil = new Date("2026-08-25T12:05:00.000Z");
    await pool.query(
      `INSERT INTO tmdb_movie_sync_queue
         (tmdb_id, popularity, status, attempts, next_attempt_at,
          claimed_at, lease_until, last_seen_export_date,
          consecutive_export_misses)
       VALUES
         (1, 100, 'pending', 0, NULL, NULL, NULL, '2026-08-24', 0),
         (2, 90, 'retry', 1, '2026-08-25 11:00:00+00', NULL, NULL, '2026-08-24', 0),
         (3, 1000, 'retry', 1, '2026-08-25 13:00:00+00', NULL, NULL, '2026-08-24', 0),
         (4, 900, 'dead', 3, NULL, NULL, NULL, '2026-08-24', 0),
         (5, 800, 'completed', 1, NULL, NULL, NULL, '2026-08-24', 0),
         (6, 700, 'processing', 1, NULL, '2026-08-25 11:59:00+00', '2026-08-25 12:10:00+00', '2026-08-24', 0),
         (7, 80, 'processing', 1, NULL, '2026-08-25 11:00:00+00', '2026-08-25 11:30:00+00', '2026-08-24', 0),
         (8, 1100, 'pending', 0, NULL, NULL, NULL, '2026-08-22', 2)`,
    );

    await expect(repository.requeueExpiredLeases(now)).resolves.toBe(1);
    const claims = await repository.claimBatch({ limit: 3, now, leaseUntil });

    expect(claims).toEqual([
      { tmdbId: 1, popularity: 100, attempts: 1, claimedAt: now },
      { tmdbId: 2, popularity: 90, attempts: 2, claimedAt: now },
      { tmdbId: 7, popularity: 80, attempts: 2, claimedAt: now },
    ]);

    const refreshAt = new Date("2026-08-25T12:00:05.000Z");
    await repository.requestRefresh([1], refreshAt);
    await repository.completeMovie(
      1,
      now,
      new Date("2026-08-25T12:00:10.000Z"),
    );
    await repository.retryMovie({
      tmdbId: 2,
      claimedAt: now,
      error: "temporary",
      nextAttemptAt: new Date("2026-08-25T12:01:00.000Z"),
      maxAttempts: 3,
    });
    await repository.retryMovie({
      tmdbId: 7,
      claimedAt: now,
      error: "attempt limit",
      nextAttemptAt: new Date("2026-08-25T12:01:00.000Z"),
      maxAttempts: 2,
    });
    await repository.markMovieUnavailable(
      6,
      new Date("2026-08-25T11:59:00.000Z"),
      "TMDB returned 404",
    );

    const outcomes = await pool.query(
      `SELECT tmdb_id::int AS tmdb_id, status, next_attempt_at, last_error,
              claimed_at, lease_until
       FROM tmdb_movie_sync_queue
       WHERE tmdb_id IN (1, 2, 6, 7)
       ORDER BY tmdb_id`,
    );
    expect(outcomes.rows).toEqual([
      {
        tmdb_id: 1,
        status: "pending",
        next_attempt_at: null,
        last_error: null,
        claimed_at: null,
        lease_until: null,
      },
      {
        tmdb_id: 2,
        status: "retry",
        next_attempt_at: new Date("2026-08-25T12:01:00.000Z"),
        last_error: "temporary",
        claimed_at: null,
        lease_until: null,
      },
      {
        tmdb_id: 6,
        status: "dead",
        next_attempt_at: null,
        last_error: "TMDB returned 404",
        claimed_at: null,
        lease_until: null,
      },
      {
        tmdb_id: 7,
        status: "dead",
        next_attempt_at: null,
        last_error: "attempt limit",
        claimed_at: null,
        lease_until: null,
      },
    ]);
  });

  it("fences late retry and unavailable outcomes from an expired claim", async () => {
    const firstClaimAt = new Date("2026-08-25T12:00:00.000Z");
    const secondClaimAt = new Date("2026-08-25T12:10:00.000Z");
    await pool.query(
      `INSERT INTO tmdb_movie_sync_queue
         (tmdb_id, popularity, status, attempts, claimed_at, lease_until,
          last_seen_export_date)
       VALUES
         (50, 10, 'processing', 1, $1, '2026-08-25 12:05:00+00', '2026-08-24'),
         (60, 9, 'processing', 1, $1, '2026-08-25 12:05:00+00', '2026-08-24')`,
      [firstClaimAt],
    );
    await repository.requeueExpiredLeases(secondClaimAt);
    await repository.claimBatch({
      limit: 2,
      now: secondClaimAt,
      leaseUntil: new Date("2026-08-25T12:15:00.000Z"),
    });

    await repository.retryMovie({
      tmdbId: 50,
      claimedAt: firstClaimAt,
      error: "late retry",
      nextAttemptAt: new Date("2026-08-25T12:20:00.000Z"),
      maxAttempts: 8,
    });
    await repository.markMovieUnavailable(60, firstClaimAt, "late 404");

    await expect(
      pool.query(
        `SELECT tmdb_id::int AS tmdb_id, status, attempts, claimed_at, last_error
         FROM tmdb_movie_sync_queue
         WHERE tmdb_id IN (50, 60)
         ORDER BY tmdb_id`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          tmdb_id: 50,
          status: "processing",
          attempts: 2,
          claimed_at: secondClaimAt,
          last_error: null,
        },
        {
          tmdb_id: 60,
          status: "processing",
          attempts: 2,
          claimed_at: secondClaimAt,
          last_error: null,
        },
      ],
    });
  });

  it("resets attempts after a successful hydration before a later refresh fails", async () => {
    const firstClaimAt = new Date("2026-08-25T12:00:00.000Z");
    await pool.query(
      `INSERT INTO tmdb_movie_sync_queue
         (tmdb_id, popularity, status, attempts, claimed_at, lease_until,
          last_seen_export_date)
       VALUES (70, 10, 'processing', 7, $1, '2026-08-25 12:05:00+00', '2026-08-24')`,
      [firstClaimAt],
    );
    await repository.completeMovie(
      70,
      firstClaimAt,
      new Date("2026-08-25T12:01:00.000Z"),
    );
    await repository.requestRefresh(
      [70],
      new Date("2026-08-25T12:02:00.000Z"),
    );
    const secondClaimAt = new Date("2026-08-25T12:03:00.000Z");
    await repository.claimBatch({
      limit: 1,
      now: secondClaimAt,
      leaseUntil: new Date("2026-08-25T12:08:00.000Z"),
    });
    await repository.retryMovie({
      tmdbId: 70,
      claimedAt: secondClaimAt,
      error: "new transient failure",
      nextAttemptAt: new Date("2026-08-25T12:04:00.000Z"),
      maxAttempts: 3,
    });

    await expect(
      pool.query(
        `SELECT status, attempts, last_error
         FROM tmdb_movie_sync_queue
         WHERE tmdb_id = 70`,
      ),
    ).resolves.toMatchObject({
      rows: [
        { status: "retry", attempts: 1, last_error: "new transient failure" },
      ],
    });
  });

  it("returns disjoint ids from concurrent claims", async () => {
    await pool.query(
      `INSERT INTO tmdb_movie_sync_queue
         (tmdb_id, popularity, last_seen_export_date)
       VALUES
         (101, 40, '2026-08-24'),
         (102, 30, '2026-08-24'),
         (103, 20, '2026-08-24'),
         (104, 10, '2026-08-24')`,
    );
    const now = new Date("2026-08-25T12:00:00.000Z");
    const leaseUntil = new Date("2026-08-25T12:05:00.000Z");

    const [first, second] = await Promise.all([
      repository.claimBatch({ limit: 2, now, leaseUntil }),
      repository.claimBatch({ limit: 2, now, leaseUntil }),
    ]);

    const firstIds = first.map(({ tmdbId }) => tmdbId);
    const secondIds = second.map(({ tmdbId }) => tmdbId);
    expect(firstIds).toHaveLength(2);
    expect(secondIds).toHaveLength(2);
    expect(new Set([...firstIds, ...secondIds])).toEqual(
      new Set([101, 102, 103, 104]),
    );
  });
});
