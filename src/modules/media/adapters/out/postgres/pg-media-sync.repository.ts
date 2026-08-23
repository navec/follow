import type { Pool, PoolClient } from "pg";

import type { SyncResult } from "@media/application/dto/sync-result.dto.js";
import type { MediaSyncRepositoryPort } from "@media/application/ports/out/media-sync-repository.port.js";
import type {
  NormalizedWorkAggregate,
  NormalizedWorkImage,
} from "@media/domain/models/normalized-work-aggregate.js";
import {
  acquirePostgresTransactionLock,
  withPostgresTransaction,
} from "@platform/database/pg-transaction.js";

interface IdRow {
  id: number;
}

interface WorkIdRow {
  work_id: number;
}

interface ImageIdRow {
  image_id: number;
}

interface ContributorIdRow {
  contributor_id: number;
}

export class PgMediaSyncRepository implements MediaSyncRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async upsertMany(
    aggregates: ReadonlyArray<NormalizedWorkAggregate>,
  ): Promise<SyncResult> {
    let created = 0;
    let updated = 0;
    const errors: Array<SyncResult["errors"][number]> = [];

    for (const aggregate of aggregates) {
      try {
        const outcome = await withPostgresTransaction(
          this.pool,
          async (client) => {
            const sourceId = await this.resolveSourceId(
              client,
              aggregate.source.provider,
            );
            await acquirePostgresTransactionLock(
              client,
              `media:source-work:${aggregate.source.provider}:${aggregate.source.sourceValue}`,
            );
            const existingWorkId = await this.findWorkId(
              client,
              sourceId,
              aggregate.source.sourceValue,
            );
            const statusId = await this.resolveStatusId(
              client,
              aggregate.work.statusCode,
            );

            let workId: number;
            let outcome: "created" | "updated";
            if (existingWorkId) {
              await client.query(
                `UPDATE works
                 SET type = $2,
                     release_date = COALESCE($3::date, release_date),
                     original_title = COALESCE($4, original_title),
                     original_language = COALESCE($5, original_language),
                     status_id = COALESCE($6, status_id),
                     updated_at = now()
                 WHERE id = $1`,
                [
                  existingWorkId,
                  aggregate.work.type,
                  aggregate.work.releaseDate ?? null,
                  aggregate.work.originalTitle ?? null,
                  aggregate.work.originalLanguage ?? null,
                  statusId,
                ],
              );
              workId = existingWorkId;
              outcome = "updated";
            } else {
              workId = await this.createWork(client, aggregate, statusId);
              await client.query(
                `INSERT INTO source_works (source_id, work_id, source_value)
                 VALUES ($1, $2, $3)`,
                [sourceId, workId, aggregate.source.sourceValue],
              );
              outcome = "created";
            }

            await this.lockChildIdentities(client, aggregate);
            await this.syncTranslations(client, workId, aggregate);
            await this.syncImages(client, sourceId, workId, aggregate);
            await this.syncContributors(client, sourceId, workId, aggregate);

            return outcome;
          },
        );

        if (outcome === "created") {
          created += 1;
        } else {
          updated += 1;
        }
      } catch (error) {
        errors.push({
          code: "PERSISTENCE_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Unknown persistence error",
          target: `${aggregate.source.provider}:${aggregate.source.sourceValue}`,
        });
      }
    }

    return {
      created,
      updated,
      skipped: 0,
      errors,
    };
  }

  private async lockChildIdentities(
    client: PoolClient,
    aggregate: NormalizedWorkAggregate,
  ): Promise<void> {
    const imageValues = [
      ...new Set((aggregate.images ?? []).map(({ sourceValue }) => sourceValue)),
    ].sort();
    for (const sourceValue of imageValues) {
      await acquirePostgresTransactionLock(
        client,
        `media:source-image:${aggregate.source.provider}:${sourceValue}`,
      );
    }

    const contributorValues = [
      ...new Set(
        (aggregate.contributors ?? []).map(({ sourceValue }) => sourceValue),
      ),
    ].sort();
    for (const sourceValue of contributorValues) {
      await acquirePostgresTransactionLock(
        client,
        `media:source-contributor:${aggregate.source.provider}:${sourceValue}`,
      );
    }
  }

  private async syncTranslations(
    client: PoolClient,
    workId: number,
    aggregate: NormalizedWorkAggregate,
  ): Promise<void> {
    const translations = [...(aggregate.translations ?? [])].sort((left, right) =>
      left.localeCode.localeCompare(right.localeCode),
    );
    for (const translation of translations) {
      await client.query(
        `INSERT INTO locales (code, language)
         VALUES ($1, $2)
         ON CONFLICT (code) DO NOTHING`,
        [translation.localeCode, translation.language],
      );
      await client.query(
        `INSERT INTO work_i18n (work_id, locale_code, title, summary, tagline)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (work_id, locale_code)
         DO UPDATE SET title = EXCLUDED.title,
                       summary = EXCLUDED.summary,
                       tagline = EXCLUDED.tagline`,
        [
          workId,
          translation.localeCode,
          translation.title,
          translation.summary ?? null,
          translation.tagline ?? null,
        ],
      );
    }
  }

  private async syncImages(
    client: PoolClient,
    sourceId: number,
    workId: number,
    aggregate: NormalizedWorkAggregate,
  ): Promise<void> {
    for (const image of aggregate.images ?? []) {
      if (image.type === "profile") {
        continue;
      }
      const imageId = await this.resolveSourceImage(client, sourceId, image);

      await client.query(
        `INSERT INTO work_images (work_id, image_id)
         VALUES ($1, $2)
         ON CONFLICT (work_id, image_id) DO NOTHING`,
        [workId, imageId],
      );
    }
  }

  private async resolveSourceImage(
    client: PoolClient,
    sourceId: number,
    image: NormalizedWorkImage,
  ): Promise<number> {
    if (image.localeCode) {
      await client.query(
        `INSERT INTO locales (code, language)
         VALUES ($1, $2)
         ON CONFLICT (code) DO NOTHING`,
        [image.localeCode, image.language ?? image.localeCode.split("-")[0]],
      );
    }

    const existing = await client.query<ImageIdRow>(
      `SELECT image_id
       FROM source_images
       WHERE source_id = $1 AND source_value = $2
       LIMIT 1`,
      [sourceId, image.sourceValue],
    );
    const imageId = existing.rows[0]?.image_id;
    if (imageId) {
      await client.query(
        `UPDATE images
         SET type = $2, url = $3, locale_code = $4
         WHERE id = $1`,
        [imageId, image.type, image.url, image.localeCode ?? null],
      );
      return imageId;
    }

    const inserted = await client.query<IdRow>(
      `INSERT INTO images (type, url, locale_code)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [image.type, image.url, image.localeCode ?? null],
    );
    const insertedImageId = inserted.rows[0]?.id;
    if (!insertedImageId) {
      throw new Error("Failed to create image");
    }
    await client.query(
      `INSERT INTO source_images (source_id, image_id, source_value)
       VALUES ($1, $2, $3)`,
      [sourceId, insertedImageId, image.sourceValue],
    );
    return insertedImageId;
  }

  private async syncContributors(
    client: PoolClient,
    sourceId: number,
    workId: number,
    aggregate: NormalizedWorkAggregate,
  ): Promise<void> {
    for (const contributor of aggregate.contributors ?? []) {
      const existing = await client.query<ContributorIdRow>(
        `SELECT contributor_id
         FROM source_contributors
         WHERE source_id = $1 AND source_value = $2
         LIMIT 1`,
        [sourceId, contributor.sourceValue],
      );
      let contributorId = existing.rows[0]?.contributor_id;
      if (contributorId) {
        await client.query(
          `UPDATE contributors SET name = $2 WHERE id = $1`,
          [contributorId, contributor.name],
        );
      } else {
        const inserted = await client.query<IdRow>(
          `INSERT INTO contributors (name)
           VALUES ($1)
           RETURNING id`,
          [contributor.name],
        );
        contributorId = inserted.rows[0]?.id;
        if (!contributorId) {
          throw new Error("Failed to create contributor");
        }
        await client.query(
          `INSERT INTO source_contributors (source_id, contributor_id, source_value)
           VALUES ($1, $2, $3)`,
          [sourceId, contributorId, contributor.sourceValue],
        );
      }

      await client.query(
        `INSERT INTO work_contributors (
           work_id,
           contributor_id,
           role,
           character_name
         )
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (work_id, contributor_id, role)
         DO UPDATE SET character_name = EXCLUDED.character_name`,
        [
          workId,
          contributorId,
          contributor.role,
          contributor.characterName ?? null,
        ],
      );
    }
  }

  private async resolveSourceId(
    client: PoolClient,
    provider: string,
  ): Promise<number> {
    await client.query(
      `INSERT INTO sources (name)
       VALUES ($1)
       ON CONFLICT (name)
       DO NOTHING`,
      [provider],
    );

    const resolved = await client.query<IdRow>(
      `SELECT id FROM sources WHERE name = $1`,
      [provider],
    );
    const sourceId = resolved.rows[0]?.id;
    if (!sourceId) {
      throw new Error(`Failed to resolve source ${provider}`);
    }
    return sourceId;
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

  private async resolveStatusId(
    client: PoolClient,
    statusCode: string | undefined,
  ): Promise<number | null> {
    if (!statusCode) {
      return null;
    }

    await client.query(
      `INSERT INTO statuses (code)
       VALUES ($1)
       ON CONFLICT (code) DO NOTHING`,
      [statusCode],
    );
    const resolved = await client.query<IdRow>(
      `SELECT id FROM statuses WHERE code = $1`,
      [statusCode],
    );
    const statusId = resolved.rows[0]?.id;
    if (!statusId) {
      throw new Error(`Failed to resolve status ${statusCode}`);
    }
    return statusId;
  }

  private async createWork(
    client: PoolClient,
    aggregate: NormalizedWorkAggregate,
    statusId: number | null,
  ): Promise<number> {
    const result = await client.query<IdRow>(
      `INSERT INTO works (
         type,
         release_date,
         original_title,
         original_language,
         status_id
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        aggregate.work.type,
        aggregate.work.releaseDate ?? null,
        aggregate.work.originalTitle ?? null,
        aggregate.work.originalLanguage ?? null,
        statusId,
      ],
    );
    const workId = result.rows[0]?.id;
    if (!workId) {
      throw new Error("Failed to create work");
    }
    return workId;
  }
}
