import { execFile } from "node:child_process";
import { glob, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("create-sql-migration", () => {
  let temporaryDirectory: string | undefined;

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("creates migration files inside the requested module", async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "follow-migration-"));
    const scriptPath = path.resolve(
      process.cwd(),
      "scripts/create-sql-migration.mjs",
    );

    await execFileAsync(process.execPath, [scriptPath, "auth", "add_refresh_tokens"], {
      cwd: temporaryDirectory,
    });

    const createdPaths: string[] = [];
    for await (const createdPath of glob("src/**/*.sql", {
      cwd: temporaryDirectory,
    })) {
      createdPaths.push(createdPath);
    }

    expect(createdPaths).toHaveLength(2);
    expect(
      createdPaths.every((createdPath) =>
        createdPath.startsWith("src/modules/auth/adapters/out/postgres/migrations/"),
      ),
    ).toBe(true);
  });
});
