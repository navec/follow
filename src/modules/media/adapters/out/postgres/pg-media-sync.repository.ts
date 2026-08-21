import type { Pool, PoolClient } from "pg";

import type { SyncResult } from "@media/application/dto/sync-result.dto.js";
import type { MediaSyncRepositoryPort } from "@media/application/ports/out/media-sync-repository.port.js";
import type { NormalizedWorkAggregate } from "@media/domain/models/normalized-work-aggregate.js";

interface IdRow {
  id: number;
}

interface WorkIdRow {
  work_id: number;
}

export class PgMediaSyncRepository implements MediaSyncRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async upsertMany(
    aggregates: ReadonlyArray<NormalizedWorkAggregate>,
  ): Promise<SyncResult> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      let created = 0;
      let updated = 0;

      for (const aggregate of aggregates) {
        const sourceId = await this.resolveSourceId(
          client,
          aggregate.source.provider,
        );
        const existingWorkId = await this.findWorkId(
          client,
          sourceId,
          aggregate.source.sourceValue,
        );

        if (existingWorkId) {
          await client.query(
            `UPDATE works
             SET type = $2,
                 updated_at = now()
             WHERE id = $1`,
            [existingWorkId, aggregate.work.type],
          );
          updated += 1;
          continue;
        }

        const workId = await this.createWork(client, aggregate);
        await client.query(
          `INSERT INTO source_works (source_id, work_id, source_value)
           VALUES ($1, $2, $3)
           ON CONFLICT (source_id, source_value)
           DO NOTHING`,
          [sourceId, workId, aggregate.source.sourceValue],
        );
        created += 1;
      }

      await client.query("COMMIT");

      return {
        created,
        updated,
        skipped: 0,
        errors: [],
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async resolveSourceId(
    client: PoolClient,
    provider: string,
  ): Promise<number> {
    const existing = await client.query<IdRow>(
      `SELECT id FROM sources WHERE name = $1 LIMIT 1`,
      [provider],
    );
    const existingId = existing.rows[0]?.id;
    if (existingId) {
      return existingId;
    }

    const inserted = await client.query<IdRow>(
      `INSERT INTO sources (name)
       VALUES ($1)
       RETURNING id`,
      [provider],
    );
    const insertedId = inserted.rows[0]?.id;
    if (!insertedId) {
      throw new Error(`Failed to resolve source ${provider}`);
    }
    return insertedId;
  }

  private async findWorkId(
    client: PoolClient,
    sourceId: number,
    sourceValue: string,
  ): Promise<number | null> {
    const result = await client.query<WorkIdRow>(
      `SELECT work_id
       FROM source_works
       WHERE source_id = $1 AND source_value = $2
       LIMIT 1`,
      [sourceId, sourceValue],
    );

    return result.rows[0]?.work_id ?? null;
  }

  private async createWork(
    client: PoolClient,
    aggregate: NormalizedWorkAggregate,
  ): Promise<number> {
    const result = await client.query<IdRow>(
      `INSERT INTO works (type, release_date)
       VALUES ($1, $2)
       RETURNING id`,
      [aggregate.work.type, aggregate.work.releaseDate ?? null],
    );
    const workId = result.rows[0]?.id;
    if (!workId) {
      throw new Error("Failed to create work");
    }
    return workId;
  }
}
