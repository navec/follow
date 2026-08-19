import { glob } from "node:fs/promises";
import path from "node:path";

import "dotenv/config";

import { runner } from "node-pg-migrate";
import type { Pool } from "pg";

const migrationsGlob = path.resolve(
  process.cwd(),
  "src/modules/*/adapters/out/postgres/migrations/*.up.js",
);

let migrationsApplied = false;
let migrationPromise: Promise<void> | null = null;

export async function discoverMigrationPaths(): Promise<string[]> {
  const paths: string[] = [];
  for await (const migrationPath of glob(migrationsGlob)) {
    paths.push(migrationPath);
  }

  return paths.sort();
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function runMigrationsWithRetry(
  run: () => Promise<void>,
  options: {
    retries?: number;
    delayMs?: number;
    sleep?: (delayMs: number) => Promise<void>;
  } = {},
): Promise<void> {
  const retries = options.retries ?? 3;
  const delayMs = options.delayMs ?? 100;
  const wait = options.sleep ?? sleep;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await run();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const isMigrationLockError = message.includes(
        "Another migration is already running",
      );

      if (!isMigrationLockError || attempt === retries) {
        throw error;
      }

      await wait(delayMs);
    }
  }
}

export function getTestDatabaseUrl(): string {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  const devDatabaseUrl = process.env.DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL is required for integration tests. Example: postgres://postgres:postgres@localhost:5432/follow_test",
    );
  }

  if (devDatabaseUrl && testDatabaseUrl === devDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL must be different from DATABASE_URL");
  }

  return testDatabaseUrl;
}

export async function migrateTestDbUpOnce(): Promise<void> {
  if (migrationsApplied) {
    return;
  }

  if (!migrationPromise) {
    migrationPromise = runMigrationsWithRetry(async () => {
      await runner({
        databaseUrl: getTestDatabaseUrl(),
        dir: migrationsGlob,
        useGlob: true,
        direction: "up",
        migrationsTable: "pgmigrations",
        checkOrder: true,
        createSchema: true,
        createMigrationsSchema: true,
        log: () => undefined,
        verbose: false,
      });
    }).then(() => {
      migrationsApplied = true;
    });
  }

  await migrationPromise;
}

export async function truncateTestTables(
  pool: Pool,
  tables: string[],
): Promise<void> {
  if (tables.length === 0) {
    return;
  }

  const identifierPattern = /^[a-z_][a-z0-9_]*$/;
  for (const table of tables) {
    if (!identifierPattern.test(table)) {
      throw new Error(`Unsafe table name for truncate: ${table}`);
    }
  }

  const sql = `TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE;`;
  await pool.query(sql);
}
