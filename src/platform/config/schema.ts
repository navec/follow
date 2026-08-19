import { z } from "zod";

export const envSchema = z.object({
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
  TMDB_BASE_URL: z.string().url().default("https://api.themoviedb.org/3"),
  TMDB_READ_ACCESS_TOKEN: z.string().min(1).optional(),
  TMDB_DEFAULT_LANGUAGE: z.string().min(1).default("fr-FR"),
  TMDB_DEFAULT_REGION: z.string().min(1).default("FR"),
  TMDB_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

export type AppEnv = z.infer<typeof envSchema>;
