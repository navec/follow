import { z } from "zod";

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
      .optional(),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(1),
    JWT_EXPIRES_IN: z.string().min(1).default("1h"),
    MEDIA_SYNC_TMDB_FEED_CRON: z.string().min(1).optional(),
    MEDIA_SYNC_TMDB_CATALOG_EXPORT_CRON: z.string().min(1).optional(),
    MEDIA_SYNC_TMDB_CATALOG_CHANGES_CRON: z.string().min(1).optional(),
    MEDIA_SYNC_TMDB_CATALOG_WORKER_CRON: z.string().min(1).optional(),
    TMDB_BASE_URL: z.string().url().default("https://api.themoviedb.org/3"),
    TMDB_EXPORT_BASE_URL: z
      .string()
      .url()
      .default("https://files.tmdb.org/p/exports/"),
    TMDB_IMAGE_BASE_URL: z
      .string()
      .url()
      .default("https://image.tmdb.org/t/p/original"),
    TMDB_READ_ACCESS_TOKEN: z.string().min(1).optional(),
    TMDB_DEFAULT_LANGUAGE: z.string().min(1).default("fr-FR"),
    TMDB_DEFAULT_REGION: z.string().min(1).default("FR"),
    TMDB_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    TMDB_CATALOG_STAGE_BATCH_SIZE: z.coerce
      .number()
      .int()
      .positive()
      .default(1000),
    TMDB_CATALOG_WORKER_BATCH_SIZE: z.coerce
      .number()
      .int()
      .positive()
      .default(100),
    TMDB_CATALOG_REQUESTS_PER_SECOND: z.coerce
      .number()
      .positive()
      .default(5),
    TMDB_CATALOG_CONCURRENCY: z.coerce.number().int().positive().default(5),
    TMDB_CATALOG_LEASE_SECONDS: z.coerce.number().int().positive().default(300),
    TMDB_CATALOG_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
    TMDB_CATALOG_RETRY_BASE_MS: z.coerce.number().int().positive().default(1000),
    TMDB_CATALOG_RETRY_MAX_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(3_600_000),
  })
  .superRefine((env, context) => {
    const catalogCronConfigured = [
      env.MEDIA_SYNC_TMDB_CATALOG_EXPORT_CRON,
      env.MEDIA_SYNC_TMDB_CATALOG_CHANGES_CRON,
      env.MEDIA_SYNC_TMDB_CATALOG_WORKER_CRON,
    ].some(Boolean);
    if (catalogCronConfigured && !env.TMDB_READ_ACCESS_TOKEN) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "TMDB_READ_ACCESS_TOKEN is required when a TMDB catalog cron is configured",
        path: ["TMDB_READ_ACCESS_TOKEN"],
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;
