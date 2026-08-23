import { describe, expect, it } from "vitest";

import { envSchema } from "@platform/config/schema.js";

const requiredEnv = {
  DATABASE_URL: "postgres://localhost/follow",
  JWT_SECRET: "test-secret",
};

describe("envSchema", () => {
  it.each(["trace", "debug", "info", "warn", "error", "fatal", "silent"])(
    "accepts the Pino log level %s",
    (level) => {
      expect(
        envSchema.parse({ ...requiredEnv, LOG_LEVEL: level }).LOG_LEVEL,
      ).toBe(level);
    },
  );

  it("rejects an unsupported log level", () => {
    expect(() =>
      envSchema.parse({ ...requiredEnv, LOG_LEVEL: "verbose" }),
    ).toThrow();
  });

  it("provides the TMDB original image base URL", () => {
    expect(envSchema.parse(requiredEnv).TMDB_IMAGE_BASE_URL).toBe(
      "https://image.tmdb.org/t/p/original",
    );
  });
});
