import { glob } from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

import { buildMigrationStatuses } from "@platform/database/migration-status.js";

const migrationsGlob = path.resolve(
  process.cwd(),
  "src/modules/*/adapters/out/postgres/migrations/*.up.js",
);

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const migrationPaths: string[] = [];
  for await (const migrationPath of glob(migrationsGlob)) {
    migrationPaths.push(migrationPath);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const tableResult = await pool.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.pgmigrations')::text AS table_name",
    );
    const appliedNames = tableResult.rows[0]?.table_name
      ? (
          await pool.query<{ name: string }>(
            "SELECT name FROM pgmigrations ORDER BY id",
          )
        ).rows.map(({ name }) => name)
      : [];

    const statuses = buildMigrationStatuses(migrationPaths, appliedNames);
    for (const status of statuses) {
      console.log(`[${status.state}] ${status.name} (${status.path})`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
