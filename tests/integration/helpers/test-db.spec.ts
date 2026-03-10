import { describe, expect, it, vi } from "vitest";

import { runMigrationsWithRetry } from "./test-db.js";

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
});
