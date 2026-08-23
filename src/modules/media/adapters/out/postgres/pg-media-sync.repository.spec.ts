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
    ]);
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
          { sourceValue: "7467", name: "David Fincher", role: "director" },
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
