import { describe, expect, it } from "vitest";

import type { AppEnv } from "@platform/config/index.js";

import { createContainer } from "./container.js";

const testEnv: AppEnv = {
  NODE_ENV: "test",
  PORT: 0,
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/follow_test",
  JWT_SECRET: "container-test-secret",
  JWT_EXPIRES_IN: "1h",
  TMDB_BASE_URL: "https://api.themoviedb.org/3",
  TMDB_DEFAULT_LANGUAGE: "fr-FR",
  TMDB_DEFAULT_REGION: "FR",
  TMDB_REQUEST_TIMEOUT_MS: 5000,
};

describe("createContainer", () => {
  it("exposes module contributions and lifecycle resources", async () => {
    const container = createContainer(testEnv);

    try {
      expect(container.authApi).toBeDefined();
      expect(container.mediaApi).toBeDefined();
      expect(container.auth.http.id).toBe("auth");
      expect(container.media.http.id).toBe("media");
      expect(container.httpEndpoints).toEqual([
        { method: "GET", path: "/health" },
        { method: "POST", path: "/auth/register" },
        { method: "POST", path: "/auth/login" },
        { method: "GET", path: "/auth/me" },
        { method: "POST", path: "/media/sync" },
      ]);
      expect(container.pgPool).toBeDefined();
    } finally {
      await container.pgPool.end();
    }
  });
});
