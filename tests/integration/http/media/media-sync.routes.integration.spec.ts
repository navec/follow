import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createContainer } from "@src/bootstrap/container.js";
import { AuthorizationService } from "@auth-internal/application/services/authorization.service.js";
import type { SyncResult } from "@application/media/dto/sync-result.dto.js";
import { createHttpApp } from "@infrastructure/http/express/app.js";

import { getTestDatabaseUrl, migrateTestDbUpOnce, truncateTestTables } from "../../helpers/test-db.js";

describe("Media sync routes integration", () => {
  const syncMediaUseCase = {
    execute: vi.fn().mockResolvedValue({
      created: 1,
      updated: 0,
      skipped: 0,
      errors: []
    } satisfies SyncResult)
  };

  let ctx: ReturnType<typeof createContainer> | undefined;
  let app: ReturnType<typeof createHttpApp> | undefined;

  beforeAll(async () => {
    await migrateTestDbUpOnce();

    ctx = createContainer({
      NODE_ENV: "test",
      PORT: 0,
      DATABASE_URL: getTestDatabaseUrl(),
      JWT_SECRET: "integration-test-secret",
      JWT_EXPIRES_IN: "1h",
      TMDB_BASE_URL: "https://api.themoviedb.org/3",
      TMDB_DEFAULT_LANGUAGE: "fr-FR",
      TMDB_DEFAULT_REGION: "FR",
      TMDB_REQUEST_TIMEOUT_MS: 5000,
    });
    app = createHttpApp({
      registerUserUseCase: ctx.registerUserUseCase,
      loginUserUseCase: ctx.loginUserUseCase,
      getCurrentUserUseCase: ctx.getCurrentUserUseCase,
      tokenService: ctx.tokenService,
      logger: pino({ enabled: false }),
      userRepository: ctx.userRepository,
      authorizationService: new AuthorizationService(),
      syncMediaUseCase
    });
  });

  beforeEach(async () => {
    syncMediaUseCase.execute.mockClear();
    if (!ctx) {
      return;
    }

    await truncateTestTables(ctx.pgPool, ["users"]);
  });

  afterAll(async () => {
    await ctx?.pgPool.end();
  });

  it("returns 403 when the user lacks media:write", async () => {
    const token = await registerAndGetToken("media-user@example.com");

    const response = await request(app!)
      .post("/media/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({
        provider: "tmdb",
        params: {
          target: "work",
          externalId: 123,
          type: "movie"
        }
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(syncMediaUseCase.execute).not.toHaveBeenCalled();
  });

  it("starts a targeted sync for an authorized admin", async () => {
    const token = await registerAndGetToken("media-admin@example.com");
    await ctx!.pgPool.query(
      `UPDATE users
       SET role = 'admin',
           permissions = ARRAY['media:write']::text[]
       WHERE email = $1`,
      ["media-admin@example.com"]
    );

    const response = await request(app!)
      .post("/media/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({
        provider: "tmdb",
        params: {
          target: "work",
          externalId: 123,
          type: "movie"
        }
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      data: {
        created: expect.any(Number),
        updated: expect.any(Number),
        skipped: expect.any(Number),
        errors: expect.any(Array),
      },
    });
    expect(syncMediaUseCase.execute).toHaveBeenCalledOnce();
  });

  async function registerAndGetToken(email: string): Promise<string> {
    const response = await request(app!)
      .post("/auth/register")
      .send({
        email,
        password: "StrongPass123!",
        verifyPassword: "StrongPass123!"
      })
      .expect(201);

    return response.body.data.accessToken as string;
  }
});
