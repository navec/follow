import type { Express } from "express";
import type { Pool } from "pg";
import pino from "pino";

import type { AppEnv } from "@platform/config/index.js";
import { createContainer } from "@bootstrap/container.js";

import { getTestDatabaseUrl, migrateTestDbUpOnce } from "./test-db.js";

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
    TMDB_DEFAULT_LANGUAGE: "fr-FR",
    TMDB_DEFAULT_REGION: "FR",
    TMDB_REQUEST_TIMEOUT_MS: 5000,
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
