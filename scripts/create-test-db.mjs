import process from "node:process";
import { URL } from "node:url";

import "dotenv/config";

import pg from "pg";

function getRequiredTestDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      "TEST_DATABASE_URL is required. Example: postgres://postgres:postgres@localhost:5432/follow_test",
    );
  }

  return value;
}

function buildAdminConnectionString(testDatabaseUrl) {
  const url = new URL(testDatabaseUrl);
  const dbName = url.pathname.replace(/^\//, "");

  if (!dbName) {
    throw new Error("TEST_DATABASE_URL must include a database name.");
  }

  url.pathname = "/postgres";

  return { adminConnectionString: url.toString(), dbName };
}

async function main() {
  const testDatabaseUrl = getRequiredTestDatabaseUrl();
  const { adminConnectionString, dbName } = buildAdminConnectionString(testDatabaseUrl);

  const client = new pg.Client({ connectionString: adminConnectionString });
  await client.connect();

  try {
    const exists = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1",
      [dbName],
    );

    if (exists.rowCount && exists.rowCount > 0) {
      console.log(`Database already exists: ${dbName}`);
      return;
    }

    // Quote identifier safely for CREATE DATABASE.
    const quotedDbName = `"${dbName.replaceAll('"', '""')}"`;
    await client.query(`CREATE DATABASE ${quotedDbName}`);
    console.log(`Database created: ${dbName}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
