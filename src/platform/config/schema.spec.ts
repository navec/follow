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

  it("provides conservative TMDB catalog defaults", () => {
    expect(envSchema.parse(requiredEnv)).toMatchObject({
      TMDB_EXPORT_BASE_URL: "https://files.tmdb.org/p/exports/",
      TMDB_CATALOG_STAGE_BATCH_SIZE: 1000,
      TMDB_CATALOG_WORKER_BATCH_SIZE: 100,
      TMDB_CATALOG_REQUESTS_PER_SECOND: 5,
      TMDB_CATALOG_CONCURRENCY: 5,
      TMDB_CATALOG_LEASE_SECONDS: 300,
      TMDB_CATALOG_MAX_ATTEMPTS: 8,
      TMDB_CATALOG_RETRY_BASE_MS: 1000,
      TMDB_CATALOG_RETRY_MAX_MS: 3_600_000,
    });
  });

  it.each([
    "TMDB_CATALOG_STAGE_BATCH_SIZE",
    "TMDB_CATALOG_WORKER_BATCH_SIZE",
    "TMDB_CATALOG_CONCURRENCY",
    "TMDB_CATALOG_LEASE_SECONDS",
    "TMDB_CATALOG_MAX_ATTEMPTS",
    "TMDB_CATALOG_RETRY_BASE_MS",
    "TMDB_CATALOG_RETRY_MAX_MS",
  ])("rejects a non-positive integer for %s", (key) => {
    expect(() => envSchema.parse({ ...requiredEnv, [key]: 0 })).toThrow();
    expect(() => envSchema.parse({ ...requiredEnv, [key]: 1.5 })).toThrow();
  });

  it("rejects a non-positive catalog request rate", () => {
    expect(() =>
      envSchema.parse({
        ...requiredEnv,
        TMDB_CATALOG_REQUESTS_PER_SECOND: 0,
      }),
    ).toThrow();
  });

  it.each([
    "MEDIA_SYNC_TMDB_CATALOG_EXPORT_CRON",
    "MEDIA_SYNC_TMDB_CATALOG_CHANGES_CRON",
    "MEDIA_SYNC_TMDB_CATALOG_WORKER_CRON",
  ])("requires a TMDB token when %s is configured", (key) => {
    expect(() =>
      envSchema.parse({ ...requiredEnv, [key]: "0 8 * * *" }),
    ).toThrow("TMDB_READ_ACCESS_TOKEN");
    expect(() =>
      envSchema.parse({
        ...requiredEnv,
        [key]: "0 8 * * *",
        TMDB_READ_ACCESS_TOKEN: "token",
      }),
    ).not.toThrow();
  });
});
