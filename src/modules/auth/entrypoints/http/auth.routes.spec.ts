import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequest } from "../../../../shared/http/context/authenticated-request.js";
import { registerHttpModules } from "../../../../shared/http/route-registry.js";
import type { BodyValidator } from "../../../../shared/http/validation/validator.js";
import type { AuthApi, AuthenticatedIdentity } from "../../public/auth-api.js";

import { createAuthHttpDefinition } from "./auth.routes.js";

describe("Auth HTTP contribution", () => {
  it("preserves register, login, and current-user response contracts", async () => {
    const registerResult = {
      user: { id: "user-1", email: "new@example.com", role: "user" as const },
      accessToken: "register-token",
    };
    const loginResult = {
      user: { id: "admin-1", email: "admin@example.com", role: "admin" as const },
      accessToken: "login-token",
    };
    const identity: AuthenticatedIdentity = {
      userId: "admin-1",
      email: "admin@example.com",
      role: "admin",
      permissions: ["media:write"],
    };
    const api = {
      register: vi.fn().mockResolvedValue(registerResult),
      login: vi.fn().mockResolvedValue(loginResult),
      authenticate: vi.fn(),
    } satisfies AuthApi;
    const bodyValidator: BodyValidator = {
      parse: vi.fn((_schema, input) => input) as BodyValidator["parse"],
    };
    const authenticate: RequestHandler = (req, _res, next) => {
      (req as AuthenticatedRequest).identity = identity;
      next();
    };
    const app = express();
    app.use(express.json());
    registerHttpModules(
      app,
      [createAuthHttpDefinition({ api, bodyValidator })],
      authenticate,
    );

    const registerInput = {
      email: "new@example.com",
      password: "password",
      verifyPassword: "password",
    };
    const registerResponse = await request(app)
      .post("/auth/register")
      .send(registerInput);
    const loginInput = { email: "admin@example.com", password: "password" };
    const loginResponse = await request(app).post("/auth/login").send(loginInput);
    const meResponse = await request(app).get("/auth/me");

    expect(registerResponse).toMatchObject({
      status: 201,
      body: { data: registerResult },
    });
    expect(api.register).toHaveBeenCalledWith(registerInput);
    expect(loginResponse).toMatchObject({
      status: 200,
      body: { data: loginResult },
    });
    expect(api.login).toHaveBeenCalledWith(loginInput);
    expect(meResponse).toMatchObject({
      status: 200,
      body: {
        data: {
          user: {
            id: "admin-1",
            email: "admin@example.com",
            role: "admin",
          },
        },
      },
    });
  });
});
