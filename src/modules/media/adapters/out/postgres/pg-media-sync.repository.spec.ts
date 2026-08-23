import { describe, expect, it, vi } from "vitest";

import { PgMediaSyncRepository } from "@media/adapters/out/postgres/pg-media-sync.repository.js";
import type { NormalizedWorkAggregate } from "@media/domain/models/normalized-work-aggregate.js";

describe("PgMediaSyncRepository", () => {
  it("upserts work and source mapping without duplicating the work", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);

        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("INSERT INTO sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [], rowCount: 0 };
        }

        if (sql.includes("INSERT INTO works")) {
          return { rows: [{ id: 20 }], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    };
    const repository = new PgMediaSyncRepository(pool as never);
    const aggregate: NormalizedWorkAggregate = {
      source: {
        provider: "tmdb",
        sourceValue: "123",
      },
      work: {
        type: "movie",
      },
    };

    const result = await repository.upsertMany([aggregate]);

    expect(result).toEqual({
      created: 1,
      updated: 0,
      skipped: 0,
      errors: [],
    });
    expect(queries[0]).toBe("BEGIN");
    expect(queries).toContain("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("uses one transaction per aggregate", async () => {
    let nextWorkId = 20;
    const clients = Array.from({ length: 2 }, () => ({
      query: vi.fn(async (sql: string) => {
        if (sql.includes("INSERT INTO sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [], rowCount: 0 };
        }

        if (sql.includes("INSERT INTO works")) {
          nextWorkId += 1;
          return { rows: [{ id: nextWorkId }], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    }));
    const pool = {
      connect: vi
        .fn()
        .mockResolvedValueOnce(clients[0])
        .mockResolvedValueOnce(clients[1]),
    };
    const repository = new PgMediaSyncRepository(pool as never);

    await repository.upsertMany([
      {
        source: { provider: "tmdb", sourceValue: "123" },
        work: { type: "movie" },
      },
      {
        source: { provider: "tmdb", sourceValue: "456" },
        work: { type: "movie" },
      },
    ]);

    expect(pool.connect).toHaveBeenCalledTimes(2);
    expect(clients[0]!.query).toHaveBeenCalledWith("BEGIN");
    expect(clients[0]!.query).toHaveBeenCalledWith("COMMIT");
    expect(clients[1]!.query).toHaveBeenCalledWith("BEGIN");
    expect(clients[1]!.query).toHaveBeenCalledWith("COMMIT");
  });

  it("locks the provider identity before looking up its work", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string, _params?: unknown[]) => {
        queries.push(sql);

        if (sql.includes("INSERT INTO sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [{ work_id: 20 }], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const repository = new PgMediaSyncRepository({
      connect: vi.fn().mockResolvedValue(client),
    } as never);

    await repository.upsertMany([
      {
        source: { provider: "tmdb", sourceValue: "550" },
        work: { type: "movie", releaseDate: "1999-10-15" },
      },
    ]);

    const lockIndex = queries.findIndex((sql) =>
      sql.includes("pg_advisory_xact_lock"),
    );
    const lookupIndex = queries.findIndex((sql) =>
      sql.includes("SELECT work_id") && sql.includes("FROM source_works"),
    );
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(lookupIndex);
    const lockCall = client.query.mock.calls.find(([sql]) =>
      sql.includes("pg_advisory_xact_lock"),
    );
    expect(lockCall?.[1]).toEqual(["media:source-work:tmdb:550"]);
  });

  it("updates the release date when a provider work already exists", async () => {
    const client = {
      query: vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes("INSERT INTO sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [{ work_id: 20 }], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const repository = new PgMediaSyncRepository({
      connect: vi.fn().mockResolvedValue(client),
    } as never);

    await repository.upsertMany([
      {
        source: { provider: "tmdb", sourceValue: "550" },
        work: { type: "movie", releaseDate: "1999-10-15" },
      },
    ]);

    const updateCall = client.query.mock.calls.find(([sql]) =>
      sql.includes("UPDATE works"),
    );
    expect(updateCall?.[0]).toContain("release_date");
    expect(updateCall?.[1]).toEqual([
      20,
      "movie",
      "1999-10-15",
      null,
      null,
      null,
    ]);
  });

  it("resolves and assigns a normalized status when creating a work", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string, _params?: unknown[]) => {
        queries.push(sql);
        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }
        if (sql.includes("SELECT id FROM statuses")) {
          return { rows: [{ id: 50 }], rowCount: 1 };
        }
        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("INSERT INTO works")) {
          return { rows: [{ id: 20 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const repository = new PgMediaSyncRepository({
      connect: vi.fn().mockResolvedValue(client),
    } as never);

    await repository.upsertMany([
      {
        source: { provider: "tmdb", sourceValue: "550" },
        work: { type: "movie", statusCode: "released" },
      },
    ]);

    const statusInsertIndex = queries.findIndex((sql) =>
      sql.includes("INSERT INTO statuses"),
    );
    const statusLookupIndex = queries.findIndex((sql) =>
      sql.includes("SELECT id FROM statuses"),
    );
    const workInsertIndex = queries.findIndex((sql) =>
      sql.includes("INSERT INTO works"),
    );
    expect(statusInsertIndex).toBeGreaterThanOrEqual(0);
    expect(statusLookupIndex).toBeGreaterThan(statusInsertIndex);
    expect(workInsertIndex).toBeGreaterThan(statusLookupIndex);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO statuses (code)"),
      ["released"],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT id FROM statuses WHERE code = $1"),
      ["released"],
    );
    const workInsert = client.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO works"),
    );
    expect(workInsert?.[0]).toContain("status_id");
    expect(workInsert?.[1]).toEqual(["movie", null, null, null, 50]);
  });

  it("updates status without clearing an existing status when omitted", async () => {
    const createClient = (statusId?: number) => ({
      query: vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }
        if (sql.includes("SELECT id FROM statuses")) {
          return { rows: [{ id: statusId }], rowCount: statusId ? 1 : 0 };
        }
        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [{ work_id: 20 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    });
    const withStatus = createClient(50);
    const withoutStatus = createClient();
    const repository = new PgMediaSyncRepository({
      connect: vi
        .fn()
        .mockResolvedValueOnce(withStatus)
        .mockResolvedValueOnce(withoutStatus),
    } as never);

    await repository.upsertMany([
      {
        source: { provider: "tmdb", sourceValue: "550" },
        work: { type: "movie", statusCode: "released" },
      },
      {
        source: { provider: "tmdb", sourceValue: "551" },
        work: { type: "movie" },
      },
    ]);

    for (const [client, expectedStatusId] of [
      [withStatus, 50],
      [withoutStatus, null],
    ] as const) {
      const update = client.query.mock.calls.find(([sql]) =>
        sql.includes("UPDATE works"),
      );
      expect(update?.[0]).toContain("status_id = COALESCE($6, status_id)");
      expect(update?.[1]).toEqual([20, "movie", null, null, null, expectedStatusId]);
    }
  });

  it("rolls back only the failed aggregate and continues the batch", async () => {
    const failingClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("INSERT INTO sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [], rowCount: 0 };
        }

        if (sql.includes("INSERT INTO works")) {
          throw new Error("database unavailable");
        }

        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const succeedingClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("INSERT INTO sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [], rowCount: 0 };
        }

        if (sql.includes("INSERT INTO works")) {
          return { rows: [{ id: 21 }], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const repository = new PgMediaSyncRepository({
      connect: vi
        .fn()
        .mockResolvedValueOnce(failingClient)
        .mockResolvedValueOnce(succeedingClient),
    } as never);

    const result = await repository.upsertMany([
      {
        source: { provider: "tmdb", sourceValue: "123" },
        work: { type: "movie" },
      },
      {
        source: { provider: "tmdb", sourceValue: "456" },
        work: { type: "movie" },
      },
    ]);

    expect(failingClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(succeedingClient.query).toHaveBeenCalledWith("COMMIT");
    expect(result).toEqual({
      created: 1,
      updated: 0,
      skipped: 0,
      errors: [
        {
          code: "PERSISTENCE_ERROR",
          message: "database unavailable",
          target: "tmdb:123",
        },
      ],
    });
  });

  it("resolves a unique source without updating and locking its existing row", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);

        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("INSERT INTO sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [{ work_id: 20 }], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const repository = new PgMediaSyncRepository({
      connect: vi.fn().mockResolvedValue(client),
    } as never);

    await repository.upsertMany([
      {
        source: { provider: "tmdb", sourceValue: "550" },
        work: { type: "movie" },
      },
    ]);

    const sourceUpsert = queries.find((sql) => sql.includes("INSERT INTO sources"));
    expect(sourceUpsert).toContain("ON CONFLICT (name)");
    expect(sourceUpsert).toContain("DO NOTHING");
    expect(sourceUpsert).not.toContain("DO UPDATE");
    const sourceLookupIndex = queries.findIndex((sql) =>
      sql.includes("SELECT id FROM sources"),
    );
    expect(sourceLookupIndex).toBeGreaterThan(
      queries.indexOf(sourceUpsert ?? ""),
    );
  });

  it("counts a write only after its transaction commits", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("INSERT INTO sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [], rowCount: 0 };
        }

        if (sql.includes("INSERT INTO works")) {
          return { rows: [{ id: 20 }], rowCount: 1 };
        }

        if (sql === "COMMIT") {
          throw new Error("commit failed");
        }

        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const repository = new PgMediaSyncRepository({
      connect: vi.fn().mockResolvedValue(client),
    } as never);

    const result = await repository.upsertMany([
      {
        source: { provider: "tmdb", sourceValue: "550" },
        work: { type: "movie" },
      },
    ]);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.errors).toEqual([
      {
        code: "PERSISTENCE_ERROR",
        message: "commit failed",
        target: "tmdb:550",
      },
    ]);
  });

  it("updates canonical movie fields and upserts its enriched relationships", async () => {
    const client = {
      query: vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }
        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [{ work_id: 20 }], rowCount: 1 };
        }
        if (sql.includes("SELECT image_id") && sql.includes("FROM source_images")) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("INSERT INTO images")) {
          return { rows: [{ id: 30 }], rowCount: 1 };
        }
        if (
          sql.includes("SELECT contributor_id") &&
          sql.includes("FROM source_contributors")
        ) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("INSERT INTO contributors")) {
          return { rows: [{ id: 40 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const repository = new PgMediaSyncRepository({
      connect: vi.fn().mockResolvedValue(client),
    } as never);

    await repository.upsertMany([
      {
        source: { provider: "tmdb", sourceValue: "550" },
        work: {
          type: "movie",
          releaseDate: "1999-10-15",
          originalTitle: "Fight Club",
          originalLanguage: "en",
        },
        translations: [
          {
            localeCode: "fr-FR",
            language: "fr",
            title: "Fight Club",
            summary: "Synopsis français",
            tagline: "Première règle",
          },
        ],
        images: [
          {
            type: "poster",
            sourceValue: "/poster.jpg",
            url: "https://image.tmdb.org/t/p/original/poster.jpg",
          },
        ],
        contributors: [
          {
            sourceValue: "287",
            name: "Brad Pitt",
            role: "actor",
            characterName: "Tyler Durden",
          },
        ],
      },
    ]);

    const updateWork = client.query.mock.calls.find(([sql]) =>
      sql.includes("UPDATE works"),
    );
    expect(updateWork?.[0]).toContain("original_title");
    expect(updateWork?.[0]).toContain("original_language");
    expect(updateWork?.[1]).toEqual([
      20,
      "movie",
      "1999-10-15",
      "Fight Club",
      "en",
      null,
    ]);
    expect(
      client.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO work_i18n")),
    ).toBe(true);
    expect(
      client.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO source_images")),
    ).toBe(true);
    expect(
      client.query.mock.calls.some(([sql]) =>
        sql.includes("INSERT INTO source_contributors"),
      ),
    ).toBe(true);
    const contributorLink = client.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO work_contributors"),
    );
    expect(contributorLink?.[1]).toEqual([
      20,
      40,
      "actor",
      "Tyler Durden",
    ]);
  });

  it("locks image and contributor identities in deterministic order", async () => {
    const lockKeys: string[] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("pg_advisory_xact_lock")) {
          lockKeys.push(String(params?.[0]));
        }
        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }
        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [{ work_id: 20 }], rowCount: 1 };
        }
        if (sql.includes("SELECT image_id") && sql.includes("FROM source_images")) {
          return { rows: [{ image_id: 30 }], rowCount: 1 };
        }
        if (
          sql.includes("SELECT contributor_id") &&
          sql.includes("FROM source_contributors")
        ) {
          return { rows: [{ contributor_id: 40 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const repository = new PgMediaSyncRepository({
      connect: vi.fn().mockResolvedValue(client),
    } as never);

    await repository.upsertMany([
      {
        source: { provider: "tmdb", sourceValue: "550" },
        work: { type: "movie" },
        images: [
          { type: "poster", sourceValue: "/z.jpg", url: "https://img/z.jpg" },
          { type: "backdrop", sourceValue: "/a.jpg", url: "https://img/a.jpg" },
        ],
        contributors: [
          { sourceValue: "7467", name: "David Fincher", role: "actor" },
          { sourceValue: "287", name: "Brad Pitt", role: "actor" },
        ],
      },
    ]);

    expect(lockKeys).toEqual([
      "media:source-work:tmdb:550",
      "media:source-image:tmdb:/a.jpg",
      "media:source-image:tmdb:/z.jpg",
      "media:source-contributor:tmdb:287",
      "media:source-contributor:tmdb:7467",
    ]);
  });

  it("persists localized gallery images without linking profile images to works", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    let nextImageId = 30;
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, ...(params ? { params } : {}) });
        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }
        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [{ work_id: 20 }], rowCount: 1 };
        }
        if (sql.includes("SELECT image_id") && sql.includes("FROM source_images")) {
          return params?.[1] === "/poster-en.jpg"
            ? { rows: [{ image_id: 31 }], rowCount: 1 }
            : { rows: [], rowCount: 0 };
        }
        if (sql.includes("INSERT INTO images")) {
          nextImageId += 1;
          return { rows: [{ id: nextImageId }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const repository = new PgMediaSyncRepository({
      connect: vi.fn().mockResolvedValue(client),
    } as never);

    await repository.upsertMany([
      {
        source: { provider: "tmdb", sourceValue: "550" },
        work: { type: "movie" },
        images: [
          {
            type: "poster",
            sourceValue: "/poster-fr.jpg",
            url: "https://img/poster-fr.jpg",
            localeCode: "fr-FR",
            language: "fr",
          },
          {
            type: "poster",
            sourceValue: "/poster-en.jpg",
            url: "https://img/poster-en.jpg",
            localeCode: "en-US",
            language: "en",
          },
          {
            type: "backdrop",
            sourceValue: "/backdrop.jpg",
            url: "https://img/backdrop.jpg",
          },
          {
            type: "profile",
            sourceValue: "/profile.jpg",
            url: "https://img/profile.jpg",
          },
        ],
      },
    ]);

    for (const [localeCode, language, imagePath] of [
      ["fr-FR", "fr", "/poster-fr.jpg"],
      ["en-US", "en", "/poster-en.jpg"],
    ] as const) {
      const localeIndex = calls.findIndex(
        ({ sql, params }) =>
          sql.includes("INSERT INTO locales") && params?.[0] === localeCode,
      );
      const imageIndex = calls.findIndex(
        ({ sql, params }) =>
          (sql.includes("INSERT INTO images") || sql.includes("UPDATE images")) &&
          params?.includes(imagePath === "/poster-en.jpg" ? 31 : `https://img/${imagePath.slice(1)}`),
      );
      expect(localeIndex).toBeGreaterThanOrEqual(0);
      expect(calls[localeIndex]?.params).toEqual([localeCode, language]);
      expect(imageIndex).toBeGreaterThan(localeIndex);
    }

    const imageInsertCalls = calls.filter(({ sql }) =>
      sql.includes("INSERT INTO images"),
    );
    expect(imageInsertCalls.map(({ sql }) => sql)).toEqual([
      expect.stringContaining("locale_code"),
      expect.stringContaining("locale_code"),
    ]);
    expect(imageInsertCalls.map(({ params }) => params)).toEqual([
      ["poster", "https://img/poster-fr.jpg", "fr-FR"],
      ["backdrop", "https://img/backdrop.jpg", null],
    ]);
    const imageUpdate = calls.find(({ sql }) => sql.includes("UPDATE images"));
    expect(imageUpdate?.sql).toContain("locale_code");
    expect(imageUpdate?.params).toEqual([
      31,
      "poster",
      "https://img/poster-en.jpg",
      "en-US",
    ]);
    const workImageLinks = calls.filter(({ sql }) =>
      sql.includes("INSERT INTO work_images"),
    );
    expect(workImageLinks).toHaveLength(3);
    expect(calls.some(({ params }) => params?.includes("/profile.jpg"))).toBe(false);
  });

  it("reuses and links cast profile images without linking them to the work", async () => {
    const lockKeys: string[] = [];
    let profileSourceExists = false;
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("pg_advisory_xact_lock")) {
          lockKeys.push(String(params?.[0]));
        }
        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }
        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [{ work_id: 20 }], rowCount: 1 };
        }
        if (sql.includes("SELECT image_id") && sql.includes("FROM source_images")) {
          if (params?.[1] === "/z-poster.jpg") {
            return { rows: [{ image_id: 31 }], rowCount: 1 };
          }
          if (params?.[1] === "/a-profile.jpg" && profileSourceExists) {
            return { rows: [{ image_id: 30 }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("INSERT INTO images")) {
          return { rows: [{ id: 30 }], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO source_images")) {
          profileSourceExists = true;
        }
        if (
          sql.includes("SELECT contributor_id") &&
          sql.includes("FROM source_contributors")
        ) {
          return params?.[1] === "287"
            ? { rows: [{ contributor_id: 40 }], rowCount: 1 }
            : { rows: [{ contributor_id: 41 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const repository = new PgMediaSyncRepository({
      connect: vi.fn().mockResolvedValue(client),
    } as never);
    const aggregate: NormalizedWorkAggregate = {
      source: { provider: "tmdb", sourceValue: "550" },
      work: { type: "movie" },
      images: [
        {
          type: "poster",
          sourceValue: "/z-poster.jpg",
          url: "https://img/z-poster.jpg",
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
            sourceValue: "/a-profile.jpg",
            url: "https://img/a-profile.jpg",
          },
        },
        {
          sourceValue: "819",
          name: "Edward Norton",
          role: "actor",
          characterName: "The Narrator",
        },
      ],
    };

    await repository.upsertMany([aggregate]);
    await repository.upsertMany([aggregate]);

    expect(lockKeys).toEqual([
      "media:source-work:tmdb:550",
      "media:source-image:tmdb:/a-profile.jpg",
      "media:source-image:tmdb:/z-poster.jpg",
      "media:source-contributor:tmdb:287",
      "media:source-contributor:tmdb:819",
      "media:source-work:tmdb:550",
      "media:source-image:tmdb:/a-profile.jpg",
      "media:source-image:tmdb:/z-poster.jpg",
      "media:source-contributor:tmdb:287",
      "media:source-contributor:tmdb:819",
    ]);
    const profileImageInserts = client.query.mock.calls.filter(
      ([sql, params]) =>
        sql.includes("INSERT INTO images") && params?.[0] === "profile",
    );
    expect(profileImageInserts).toHaveLength(1);
    const profileLinks = client.query.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO contributor_images"),
    );
    expect(profileLinks).toHaveLength(2);
    expect(profileLinks[0]?.[0]).toContain(
      "ON CONFLICT (contributor_id, image_id) DO NOTHING",
    );
    expect(profileLinks.map(([, params]) => params)).toEqual([
      [40, 30],
      [40, 30],
    ]);
    const workImageLinks = client.query.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO work_images"),
    );
    expect(workImageLinks.map(([, params]) => params)).toEqual([
      [20, 31],
      [20, 31],
    ]);
  });

  it("upserts locale identities in deterministic order", async () => {
    const localeCodes: string[] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }
        if (sql.includes("SELECT work_id") && sql.includes("FROM source_works")) {
          return { rows: [{ work_id: 20 }], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO locales")) {
          localeCodes.push(String(params?.[0]));
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const repository = new PgMediaSyncRepository({
      connect: vi.fn().mockResolvedValue(client),
    } as never);

    await repository.upsertMany([
      {
        source: { provider: "tmdb", sourceValue: "550" },
        work: { type: "movie" },
        translations: [
          { localeCode: "fr-FR", language: "fr", title: "Fight Club" },
          { localeCode: "en-US", language: "en", title: "Fight Club" },
        ],
      },
    ]);

    expect(localeCodes).toEqual(["en-US", "fr-FR"]);
  });
});
