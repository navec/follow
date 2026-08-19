import { describe, expect, it, vi } from "vitest";

import type { NormalizedWorkAggregate } from "../../../domain/models/normalized-work-aggregate.js";

import { PgMediaSyncRepository } from "./pg-media-sync.repository.js";

describe("PgMediaSyncRepository", () => {
  it("upserts work and source mapping without duplicating the work", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);

        if (sql.includes("SELECT id FROM sources")) {
          return { rows: [], rowCount: 0 };
        }

        if (sql.includes("INSERT INTO sources")) {
          return { rows: [{ id: 10 }], rowCount: 1 };
        }

        if (sql.includes("SELECT work_id FROM source_works")) {
          return { rows: [], rowCount: 0 };
        }

        if (sql.includes("INSERT INTO works")) {
          return { rows: [{ id: 20 }], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn()
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(client)
    };
    const repository = new PgMediaSyncRepository(pool as never);
    const aggregate: NormalizedWorkAggregate = {
      source: {
        provider: "tmdb",
        sourceValue: "123"
      },
      work: {
        type: "movie"
      }
    };

    const result = await repository.upsertMany([aggregate]);

    expect(result).toEqual({
      created: 1,
      updated: 0,
      skipped: 0,
      errors: []
    });
    expect(queries[0]).toBe("BEGIN");
    expect(queries).toContain("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });
});
