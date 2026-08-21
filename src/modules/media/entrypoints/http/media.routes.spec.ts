import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createMediaHttpDefinition } from "@media/entrypoints/http/media.routes.js";
import type { MediaApi, SyncResult } from "@media/public/media-api.js";
import type { AuthenticatedRequest } from "@shared/http/context/authenticated-request.js";
import { registerHttpModules } from "@shared/http/route-registry.js";
import type { BodyValidator } from "@shared/http/validation/validator.js";

describe("Media HTTP contribution", () => {
  it("declares authenticated sync and preserves its accepted response", async () => {
    const result: SyncResult = {
      created: 1,
      updated: 2,
      skipped: 3,
      errors: [],
    };
    const api = {
      sync: vi.fn().mockResolvedValue(result),
    } satisfies MediaApi;
    const bodyValidator: BodyValidator = {
      parse: vi.fn((_schema, input) => input) as BodyValidator["parse"],
    };
    const authenticate: RequestHandler = (req, _res, next) => {
      (req as AuthenticatedRequest).identity = {
        userId: "admin-1",
        email: "admin@example.com",
        role: "admin",
        permissions: ["media:write"],
      };
      next();
    };
    const app = express();
    app.use(express.json());
    registerHttpModules(
      app,
      [createMediaHttpDefinition({ api, bodyValidator })],
      authenticate,
    );
    const command = {
      provider: "tmdb" as const,
      params: { target: "work" as const, externalId: 123, type: "movie" },
    };

    const response = await request(app).post("/media/sync").send(command);

    expect(response).toMatchObject({ status: 202, body: { data: result } });
    expect(api.sync).toHaveBeenCalledWith(command, {
      id: "admin-1",
      role: "admin",
      permissions: ["media:write"],
    });
  });
});
