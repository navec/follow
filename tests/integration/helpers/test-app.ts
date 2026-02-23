import type { Express } from "express";
import type { Pool } from "pg";

import { createContainer } from "@src/bootstrap/container.js";
import type { AppEnv } from "@infrastructure/config/index.js";
import { createHttpApp } from "@infrastructure/http/express/app.js";

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
    JWT_EXPIRES_IN: "1h"
  };
}

export async function createIntegrationTestContext(): Promise<IntegrationTestContext> {
  await migrateTestDbUpOnce();

  const container = createContainer(createTestEnv());
  const app = createHttpApp({
    registerUserUseCase: container.registerUserUseCase,
    loginUserUseCase: container.loginUserUseCase,
    getCurrentUserUseCase: container.getCurrentUserUseCase,
    tokenService: container.tokenService
  });

  return {
    app,
    pgPool: container.pgPool
  };
}

export async function closeIntegrationTestContext(ctx: IntegrationTestContext): Promise<void> {
  await ctx.pgPool.end();
}
