import type { Express } from "express";
import type { Pool } from "pg";
import pino from "pino";

import type { AppEnv } from "@platform/config/index.js";
import { createContainer } from "@bootstrap/container.js";
import { getTestDatabaseUrl, migrateTestDbUpOnce } from "@tests/integration/helpers/test-db.js";

export interface IntegrationTestContext {
  app: Express;
  pgPool: Pool;
}

function createTestEnv(): AppEnv {
  return {
    NODE_ENV: "test",
    PORT: 0,
    DATABASE_URL: getTestDatabaseUrl(),
    JWT_SECRET: "integration-test-secret",
    JWT_EXPIRES_IN: "1h",
    TMDB_BASE_URL: "https://api.themoviedb.org/3",
    TMDB_IMAGE_BASE_URL: "https://image.tmdb.org/t/p/original",
    TMDB_DEFAULT_LANGUAGE: "fr-FR",
    TMDB_DEFAULT_REGION: "FR",
    TMDB_REQUEST_TIMEOUT_MS: 5000,
    TMDB_EXPORT_BASE_URL: "https://files.tmdb.org/p/exports/",
    TMDB_CATALOG_STAGE_BATCH_SIZE: 10,
    TMDB_CATALOG_WORKER_BATCH_SIZE: 10,
    TMDB_CATALOG_REQUESTS_PER_SECOND: 1000,
    TMDB_CATALOG_CONCURRENCY: 1,
    TMDB_CATALOG_LEASE_SECONDS: 300,
    TMDB_CATALOG_MAX_ATTEMPTS: 3,
    TMDB_CATALOG_RETRY_BASE_MS: 1,
    TMDB_CATALOG_RETRY_MAX_MS: 10,
  };
}

export async function createIntegrationTestContext(): Promise<IntegrationTestContext> {
  await migrateTestDbUpOnce();

  const container = createContainer(createTestEnv(), {
    logger: pino({ enabled: false }),
  });

  return {
    app: container.app,
    pgPool: container.pgPool
  };
}

export async function closeIntegrationTestContext(ctx: IntegrationTestContext): Promise<void> {
  await ctx.pgPool.end();
}
