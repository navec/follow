import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type MediaApi, MediaForbiddenError, type SyncResult } from "@media";
import { createHttpApp } from "@entrypoints/http/app.js";
import { createContainer } from "@bootstrap/container.js";

import { createMediaHttpDefinition } from "../../../../src/modules/media/entrypoints/http/media.routes.js";
import { ZodBodyValidator } from "../../../../src/shared/http/validation/zod-validator.js";
import { getTestDatabaseUrl, migrateTestDbUpOnce, truncateTestTables } from "../../helpers/test-db.js";

describe("Media sync routes integration", () => {
  const syncMediaUseCase = {
    sync: vi.fn<MediaApi["sync"]>().mockImplementation(async (_command, actor) => {
      if (!actor.permissions.includes("media:write")) {
        throw new MediaForbiddenError();
      }

      return {
        created: 1,
        updated: 0,
        skipped: 0,
        errors: [],
      } satisfies SyncResult;
    }),
  } satisfies MediaApi;

  let ctx: ReturnType<typeof createContainer> | undefined;
  let app: ReturnType<typeof createHttpApp> | undefined;

  beforeAll(async () => {
    await migrateTestDbUpOnce();

    ctx = createContainer(
      {
        NODE_ENV: "test",
        PORT: 0,
        DATABASE_URL: getTestDatabaseUrl(),
        JWT_SECRET: "integration-test-secret",
        JWT_EXPIRES_IN: "1h",
        TMDB_BASE_URL: "https://api.themoviedb.org/3",
        TMDB_DEFAULT_LANGUAGE: "fr-FR",
        TMDB_DEFAULT_REGION: "FR",
        TMDB_REQUEST_TIMEOUT_MS: 5000,
      },
      { logger: pino({ enabled: false }) },
    );
    app = createHttpApp({
      auth: ctx.auth,
      logger: ctx.logger,
      media: {
        api: syncMediaUseCase,
        http: createMediaHttpDefinition({
          api: syncMediaUseCase,
          bodyValidator: new ZodBodyValidator(),
        }),
      },
    });
  });

  beforeEach(async () => {
    syncMediaUseCase.sync.mockClear();
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
    expect(syncMediaUseCase.sync).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        role: "user",
        permissions: [],
      }),
    );
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
    expect(syncMediaUseCase.sync).toHaveBeenCalledOnce();
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
