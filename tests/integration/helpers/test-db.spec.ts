import { describe, expect, it, vi } from "vitest";

import { discoverMigrationPaths, runMigrationsWithRetry } from "./test-db.js";

describe("runMigrationsWithRetry", () => {
  it("retries when node-pg-migrate reports an active migration lock", async () => {
    const runner = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("Another migration is already running"))
      .mockResolvedValueOnce();
    const sleep = vi.fn<(_: number) => Promise<void>>().mockResolvedValue();

    await runMigrationsWithRetry(runner, { retries: 2, delayMs: 1, sleep });

    expect(runner).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1);
  });

  it("discovers Auth and Media migrations from their module directories", async () => {
    const paths = await discoverMigrationPaths();

    expect(paths.some((migrationPath) => migrationPath.includes("modules/auth"))).toBe(true);
    expect(paths.some((migrationPath) => migrationPath.includes("modules/media"))).toBe(true);
  });
});
