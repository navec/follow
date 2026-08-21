import type { RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { AuthModule } from "@auth/auth.module.js";
import type { MediaModule } from "@media/media.module.js";
import { createHttpApp } from "@bootstrap/http/app.js";

const respond = (status: number, body: object): RequestHandler => {
  return (_request, response) => {
    response.status(status).json(body);
  };
};

describe("Bootstrap HTTP app", () => {
  it("assembles module routes, authentication, health, and endpoint metadata", async () => {
    const authenticate = vi.fn().mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      role: "user",
      permissions: [],
    });
    const auth: AuthModule = {
      api: {
        register: vi.fn(),
        login: vi.fn(),
        authenticate,
      },
      http: {
        id: "auth",
        basePath: "/auth",
        routes: [
          {
            method: "GET",
            path: "/public",
            access: "public",
            handler: respond(200, { data: "auth-public" }),
          },
          {
            method: "GET",
            path: "/private",
            access: "authenticated",
            handler: respond(201, { data: "auth-private" }),
          },
        ],
      },
    };
    const media: MediaModule = {
      api: { sync: vi.fn() },
      http: {
        id: "media",
        basePath: "/media",
        routes: [
          {
            method: "POST",
            path: "/action",
            access: "authenticated",
            handler: respond(202, { data: "media-action" }),
          },
        ],
      },
      scheduledJobs: [],
    };

    const http = createHttpApp({
      auth,
      media,
      logger: { info: vi.fn(), error: vi.fn() },
    });

    expect(await request(http.app).get("/health")).toMatchObject({
      status: 200,
      body: { data: { status: "ok" } },
    });
    expect(await request(http.app).get("/auth/public")).toMatchObject({
      status: 200,
      body: { data: "auth-public" },
    });
    expect(authenticate).not.toHaveBeenCalled();
    expect(
      await request(http.app)
        .get("/auth/private")
        .set("Authorization", "Bearer private-token"),
    ).toMatchObject({ status: 201, body: { data: "auth-private" } });
    expect(authenticate).toHaveBeenCalledWith("private-token");
    expect(
      await request(http.app)
        .post("/media/action")
        .set("Authorization", "Bearer media-token"),
    ).toMatchObject({ status: 202, body: { data: "media-action" } });

    expect(http.endpoints).toEqual([
      { method: "GET", path: "/health" },
      { method: "GET", path: "/auth/public" },
      { method: "GET", path: "/auth/private" },
      { method: "POST", path: "/media/action" },
    ]);
  });
});
