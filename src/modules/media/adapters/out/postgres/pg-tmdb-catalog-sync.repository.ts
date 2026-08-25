import type { Pool } from "pg";

import type { TmdbInventoryMovie } from "@media/application/models/tmdb-catalog-sync.js";

interface JobLockRow {
  acquired: boolean;
}

interface ReconciliationCountRow {
  inserted: string;
  updated: string;
}

interface ChangesStateRow {
  last_completed_changes_at: Date | null;
}

type CatalogPool = Pick<Pool, "connect" | "query">;

export class PgTmdbCatalogSyncRepository {
  constructor(private readonly pool: CatalogPool) {}

  async withJobLock<TResult>(
    key: string,
    task: () => Promise<TResult>,
  ): Promise<TResult | undefined> {
    const client = await this.pool.connect();
    let acquired = false;

    try {
      const result = await client.query<JobLockRow>(
        `SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired`,
        [key],
      );
      acquired = result.rows[0]?.acquired === true;
      if (!acquired) {
        return undefined;
      }

      return await task();
    } finally {
      try {
        if (acquired) {
          await client.query(
            `SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked`,
            [key],
          );
        }
      } finally {
        client.release();
      }
    }
  }

  async resetInventoryStage(exportDate: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM tmdb_movie_inventory_staging WHERE export_date = $1`,
      [exportDate],
    );
  }

  async stageInventoryBatch(
    exportDate: string,
    movies: ReadonlyArray<TmdbInventoryMovie>,
  ): Promise<void> {
    if (movies.length === 0) {
      return;
    }

    const placeholders = movies.map((_, index) => {
      const firstMovieParameter = index * 2 + 2;
      return `($1, $${firstMovieParameter}, $${firstMovieParameter + 1})`;
    });
    const values: unknown[] = [exportDate];
    for (const movie of movies) {
      values.push(movie.tmdbId, movie.popularity);
    }

    await this.pool.query(
      `INSERT INTO tmdb_movie_inventory_staging
         (export_date, tmdb_id, popularity)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (export_date, tmdb_id)
       DO UPDATE SET popularity = EXCLUDED.popularity`,
      values,
    );
  }

  async reconcileInventory(
    exportDate: string,
  ): Promise<{ inserted: number; updated: number; missing: number }> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const counts = await client.query<ReconciliationCountRow>(
        `SELECT COUNT(*) FILTER (WHERE queue.tmdb_id IS NULL) AS inserted,
                COUNT(*) FILTER (WHERE queue.tmdb_id IS NOT NULL) AS updated
         FROM tmdb_movie_inventory_staging AS stage
         LEFT JOIN tmdb_movie_sync_queue AS queue
           ON queue.tmdb_id = stage.tmdb_id
         WHERE stage.export_date = $1`,
        [exportDate],
      );
      await client.query(
        `INSERT INTO tmdb_movie_sync_queue
           (tmdb_id, popularity, last_seen_export_date)
         SELECT tmdb_id, popularity, export_date
         FROM tmdb_movie_inventory_staging
         WHERE export_date = $1
         ON CONFLICT (tmdb_id) DO UPDATE SET
           popularity = EXCLUDED.popularity,
           last_seen_export_date = EXCLUDED.last_seen_export_date,
           consecutive_export_misses = 0,
           updated_at = NOW()`,
        [exportDate],
      );
      const missing = await client.query(
        `UPDATE tmdb_movie_sync_queue
         SET consecutive_export_misses = consecutive_export_misses + 1,
             updated_at = NOW()
         WHERE last_seen_export_date < $1`,
        [exportDate],
      );
      await client.query(
        `UPDATE tmdb_catalog_sync_state
         SET last_completed_export_date = $1,
             updated_at = NOW()
         WHERE singleton = TRUE`,
        [exportDate],
      );
      await client.query(
        `DELETE FROM tmdb_movie_inventory_staging WHERE export_date = $1`,
        [exportDate],
      );
      await client.query("COMMIT");

      const countRow = counts.rows[0];
      return {
        inserted: Number(countRow?.inserted ?? 0),
        updated: Number(countRow?.updated ?? 0),
        missing: missing.rowCount ?? 0,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getLastCompletedChangesAt(): Promise<Date | undefined> {
    const result = await this.pool.query<ChangesStateRow>(
      `SELECT last_completed_changes_at
       FROM tmdb_catalog_sync_state
       WHERE singleton = TRUE`,
    );
    return result.rows[0]?.last_completed_changes_at ?? undefined;
  }

  async requestRefresh(
    ids: ReadonlyArray<number>,
    requestedAt: Date,
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.pool.query(
      `UPDATE tmdb_movie_sync_queue
       SET status = CASE
             WHEN status = 'processing' THEN status
             ELSE 'pending'
           END,
           next_attempt_at = CASE
             WHEN status = 'processing' THEN next_attempt_at
             ELSE NULL
           END,
           refresh_requested_at = $2,
           updated_at = $2
       WHERE tmdb_id = ANY($1::bigint[])
         AND consecutive_export_misses < 2`,
      [ids, requestedAt],
    );
  }

  async completeChangesWindow(completedAt: Date): Promise<void> {
    await this.pool.query(
      `UPDATE tmdb_catalog_sync_state
       SET last_completed_changes_at = $1,
           updated_at = NOW()
       WHERE singleton = TRUE`,
      [completedAt],
    );
  }
}
