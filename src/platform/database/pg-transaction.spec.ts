import { describe, expect, it, vi } from "vitest";

import {
  acquirePostgresTransactionLock,
  withPostgresTransaction,
} from "@platform/database/pg-transaction.js";

describe("withPostgresTransaction", () => {
  it("commits the callback result and releases the client", async () => {
    const client = {
      query: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    };
    const operation = vi.fn().mockResolvedValue("created");

    const result = await withPostgresTransaction(pool as never, operation);

    expect(result).toBe("created");
    expect(operation).toHaveBeenCalledWith(client);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      "COMMIT",
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back an error, releases the client, and preserves the original error", async () => {
    const originalError = new Error("write failed");
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql === "ROLLBACK") {
          throw new Error("rollback failed");
        }
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    };

    await expect(
      withPostgresTransaction(pool as never, async () => {
        throw originalError;
      }),
    ).rejects.toBe(originalError);

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });
});

describe("acquirePostgresTransactionLock", () => {
  it("acquires a 64-bit transaction-scoped advisory lock for the key", async () => {
    const client = {
      query: vi.fn().mockResolvedValue(undefined),
    };

    await acquirePostgresTransactionLock(client as never, "media:work:tmdb:550");

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "pg_advisory_xact_lock(hashtextextended($1, 0))",
      ),
      ["media:work:tmdb:550"],
    );
  });
});
