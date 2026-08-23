import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PgMediaSyncRepository } from "@media/adapters/out/postgres/pg-media-sync.repository.js";
import type { NormalizedWorkAggregate } from "@media/domain/models/normalized-work-aggregate.js";
import {
  getTestDatabaseUrl,
  migrateTestDbUpOnce,
  truncateTestTables,
} from "@tests/integration/helpers/test-db.js";

describe("PgMediaSyncRepository integration", () => {
  const pool = new Pool({ connectionString: getTestDatabaseUrl() });
  const repository = new PgMediaSyncRepository(pool);

  beforeAll(async () => {
    await migrateTestDbUpOnce();
  });

  beforeEach(async () => {
    await truncateTestTables(pool, [
      "sources",
      "works",
      "contributors",
      "images",
      "locales",
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates one mapped work for concurrent imports of the same provider id", async () => {
    const aggregate = {
      source: { provider: "tmdb" as const, sourceValue: "550" },
      work: { type: "movie", releaseDate: "1999-10-15" },
    };

    const results = await Promise.all([
      repository.upsertMany([aggregate]),
      repository.upsertMany([aggregate]),
    ]);

    expect(results.flatMap(({ errors }) => errors)).toEqual([]);
    expect(results.reduce((sum, { created }) => sum + created, 0)).toBe(1);
    expect(results.reduce((sum, { updated }) => sum + updated, 0)).toBe(1);

    const sources = await pool.query(
      `SELECT id, name FROM sources WHERE name = 'tmdb'`,
    );
    const works = await pool.query(
      `SELECT w.id, w.type, w.release_date::text AS release_date
       FROM works w
       JOIN source_works sw ON sw.work_id = w.id
       JOIN sources s ON s.id = sw.source_id
       WHERE s.name = 'tmdb' AND sw.source_value = '550'`,
    );

    expect(sources.rowCount).toBe(1);
    expect(works.rowCount).toBe(1);
    expect(works.rows[0]).toMatchObject({
      type: "movie",
      release_date: "1999-10-15",
    });
  });

  it("persists and updates a complete targeted TMDB movie aggregate", async () => {
    const aggregate = {
      source: { provider: "tmdb", sourceValue: "550" },
      work: {
        type: "movie",
        releaseDate: "1999-10-15",
        originalTitle: "Fight Club",
        originalLanguage: "en",
        statusCode: "released",
      },
      translations: [
        {
          localeCode: "fr-FR",
          language: "fr",
          title: "Fight Club",
          summary: "Synopsis français",
          tagline: "Première règle",
        },
        {
          localeCode: "en-US",
          language: "en",
          title: "Fight Club",
          summary: "English overview",
          tagline: "Mischief. Mayhem. Soap.",
        },
        {
          localeCode: "es-ES",
          language: "es",
          title: "El club de la lucha",
          summary: "Resumen",
        },
      ],
      images: [
        {
          type: "poster",
          sourceValue: "/poster-fr.jpg",
          url: "https://image.tmdb.org/t/p/original/poster-fr.jpg",
          localeCode: "fr-FR",
          language: "fr",
        },
        {
          type: "poster",
          sourceValue: "/poster-en.jpg",
          url: "https://image.tmdb.org/t/p/original/poster-en.jpg",
          localeCode: "en-US",
          language: "en",
        },
        {
          type: "backdrop",
          sourceValue: "/backdrop.jpg",
          url: "https://image.tmdb.org/t/p/original/backdrop.jpg",
        },
      ],
      contributors: [
        {
          sourceValue: "287",
          name: "Brad Pitt",
          role: "actor",
          characterName: "Tyler Durden",
          profileImage: {
            type: "profile",
            sourceValue: "/brad-pitt.jpg",
            url: "https://image.tmdb.org/t/p/original/brad-pitt.jpg",
          },
        },
        {
          sourceValue: "819",
          name: "Edward Norton",
          role: "actor",
          characterName: "The Narrator",
        },
      ],
    } satisfies NormalizedWorkAggregate;

    const created = await repository.upsertMany([aggregate]);

    expect(created).toMatchObject({ created: 1, updated: 0, errors: [] });

    const work = await pool.query(
      `SELECT w.id,
              w.original_title,
              w.original_language,
              st.code AS status_code
       FROM works w
       LEFT JOIN statuses st ON st.id = w.status_id
       JOIN source_works sw ON sw.work_id = w.id
       JOIN sources s ON s.id = sw.source_id
       WHERE s.name = 'tmdb' AND sw.source_value = '550'`,
    );
    const workId = work.rows[0]?.id as string;
    const translations = await pool.query(
      `SELECT locale_code, title, summary, tagline
       FROM work_i18n
       WHERE work_id = $1
       ORDER BY locale_code`,
      [workId],
    );
    const images = await pool.query(
      `SELECT i.type, i.url, i.locale_code, si.source_value
       FROM work_images wi
       JOIN images i ON i.id = wi.image_id
       JOIN source_images si ON si.image_id = i.id
       WHERE wi.work_id = $1
       ORDER BY si.source_value`,
      [workId],
    );
    const profileImages = await pool.query(
      `SELECT c.name, i.type, i.url, si.source_value
       FROM contributor_images ci
       JOIN contributors c ON c.id = ci.contributor_id
       JOIN images i ON i.id = ci.image_id
       JOIN source_images si ON si.image_id = i.id
       ORDER BY si.source_value`,
    );
    const contributors = await pool.query(
      `SELECT c.name, sc.source_value, wc.role, wc.character_name
       FROM work_contributors wc
       JOIN contributors c ON c.id = wc.contributor_id
       JOIN source_contributors sc ON sc.contributor_id = c.id
       WHERE wc.work_id = $1
       ORDER BY sc.source_value`,
      [workId],
    );

    expect(work.rows[0]).toMatchObject({
      original_title: "Fight Club",
      original_language: "en",
      status_code: "released",
    });
    expect(translations.rows).toEqual([
      {
        locale_code: "en-US",
        title: "Fight Club",
        summary: "English overview",
        tagline: "Mischief. Mayhem. Soap.",
      },
      {
        locale_code: "es-ES",
        title: "El club de la lucha",
        summary: "Resumen",
        tagline: null,
      },
      {
        locale_code: "fr-FR",
        title: "Fight Club",
        summary: "Synopsis français",
        tagline: "Première règle",
      },
    ]);
    expect(images.rows).toEqual([
      {
        type: "backdrop",
        url: "https://image.tmdb.org/t/p/original/backdrop.jpg",
        locale_code: null,
        source_value: "/backdrop.jpg",
      },
      {
        type: "poster",
        url: "https://image.tmdb.org/t/p/original/poster-en.jpg",
        locale_code: "en-US",
        source_value: "/poster-en.jpg",
      },
      {
        type: "poster",
        url: "https://image.tmdb.org/t/p/original/poster-fr.jpg",
        locale_code: "fr-FR",
        source_value: "/poster-fr.jpg",
      },
    ]);
    expect(contributors.rows).toEqual([
      {
        name: "Brad Pitt",
        source_value: "287",
        role: "actor",
        character_name: "Tyler Durden",
      },
      {
        name: "Edward Norton",
        source_value: "819",
        role: "actor",
        character_name: "The Narrator",
      },
    ]);
    expect(profileImages.rows).toEqual([
      {
        name: "Brad Pitt",
        type: "profile",
        url: "https://image.tmdb.org/t/p/original/brad-pitt.jpg",
        source_value: "/brad-pitt.jpg",
      },
    ]);
    expect(
      await pool.query(
        `SELECT count(*)::int AS count
         FROM work_images wi
         JOIN images i ON i.id = wi.image_id
         WHERE wi.work_id = $1 AND i.type = 'profile'`,
        [workId],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] });

    const updatedAggregate: NormalizedWorkAggregate = {
      ...aggregate,
      translations: aggregate.translations.map((translation) =>
        translation.localeCode === "fr-FR"
          ? { ...translation, summary: "Synopsis français corrigé" }
          : translation,
      ),
      images: aggregate.images.map((image) =>
        image.sourceValue === "/poster-fr.jpg"
          ? { ...image, url: "https://cdn.example/poster-fr.jpg" }
          : image,
      ),
      contributors: aggregate.contributors.map((contributor) =>
        contributor.sourceValue === "287"
          ? {
              ...contributor,
              characterName: "Tyler",
              profileImage: {
                type: "profile",
                sourceValue: "/brad-pitt.jpg",
                url: "https://cdn.example/brad-pitt.jpg",
              },
            }
          : contributor,
      ),
    };

    const updated = await repository.upsertMany([updatedAggregate]);

    expect(updated).toMatchObject({ created: 0, updated: 1, errors: [] });
    expect(
      await pool.query(`SELECT count(*)::int AS count FROM works`),
    ).toMatchObject({ rows: [{ count: 1 }] });
    expect(
      await pool.query(`SELECT count(*)::int AS count FROM contributors`),
    ).toMatchObject({ rows: [{ count: 2 }] });
    expect(
      await pool.query(`SELECT count(*)::int AS count FROM images`),
    ).toMatchObject({ rows: [{ count: 4 }] });
    expect(
      await pool.query(
        `SELECT summary FROM work_i18n
         WHERE work_id = $1 AND locale_code = 'fr-FR'`,
        [workId],
      ),
    ).toMatchObject({ rows: [{ summary: "Synopsis français corrigé" }] });
    expect(
      await pool.query(
        `SELECT wc.character_name
         FROM work_contributors wc
         JOIN source_contributors sc ON sc.contributor_id = wc.contributor_id
         WHERE wc.work_id = $1 AND sc.source_value = '287'`,
        [workId],
      ),
    ).toMatchObject({ rows: [{ character_name: "Tyler" }] });
    expect(
      await pool.query(
        `SELECT i.url
         FROM contributor_images ci
         JOIN images i ON i.id = ci.image_id
         JOIN source_images si ON si.image_id = i.id
         WHERE si.source_value = '/brad-pitt.jpg'`,
      ),
    ).toMatchObject({ rows: [{ url: "https://cdn.example/brad-pitt.jpg" }] });
  });
});
