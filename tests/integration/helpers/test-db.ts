import path from "node:path";

import "dotenv/config";

import { runner } from "node-pg-migrate";
import type { Pool } from "pg";

const migrationsDir = path.resolve(
  process.cwd(),
  "src/infrastructure/persistence/postgres/migrations",
);

let migrationsApplied = false;

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

  await runner({
    databaseUrl: getTestDatabaseUrl(),
    dir: migrationsDir,
    direction: "up",
    migrationsTable: "pgmigrations",
    checkOrder: true,
    createSchema: true,
    createMigrationsSchema: true,
    log: () => undefined,
    verbose: false,
  });

  migrationsApplied = true;
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
