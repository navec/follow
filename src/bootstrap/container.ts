import type { SignOptions } from "jsonwebtoken";
import type { Logger } from "pino";

import type { AppEnv } from "@platform/config/index.js";
import { createPgPool } from "@platform/database/pg-client.js";
import { createLogger } from "@platform/logging/logger.js";

import { createHttpApp } from "../entrypoints/http/app.js";
import { MediaSyncScheduler } from "../entrypoints/scheduler/media-sync.scheduler.js";
import { PgUserRepository } from "../modules/auth/adapters/out/postgres/pg-user.repository.js";
import { Argon2PasswordHasher } from "../modules/auth/adapters/out/security/argon2-password-hasher.js";
import { JwtTokenService } from "../modules/auth/adapters/out/security/jwt-token-service.js";
import { createAuthModule } from "../modules/auth/auth.module.js";
import { MangadexMediaSyncProvider } from "../modules/media/adapters/out/mangadex/mangadex-media-sync.provider.js";
import { PgMediaSyncRepository } from "../modules/media/adapters/out/postgres/pg-media-sync.repository.js";
import { TmdbHttpClient } from "../modules/media/adapters/out/tmdb/tmdb-http.client.js";
import { TmdbMediaSyncProvider } from "../modules/media/adapters/out/tmdb/tmdb-media-sync.provider.js";
import { createMediaModule } from "../modules/media/media.module.js";
import { ZodBodyValidator } from "../shared/http/validation/zod-validator.js";

type SchedulerSchedule = ConstructorParameters<typeof MediaSyncScheduler>[2];

const disabledSchedule: SchedulerSchedule = () => ({});

interface ContainerOptions {
  logger?: Logger;
  schedule?: SchedulerSchedule;
}

export function createContainer(
  env: AppEnv,
  options: ContainerOptions = {},
) {
  const pgPool = createPgPool(env.DATABASE_URL);
  const userRepository = new PgUserRepository(pgPool);
  const mediaSyncRepository = new PgMediaSyncRepository(pgPool);
  const passwordHasher = new Argon2PasswordHasher();
  const tokenService = new JwtTokenService({
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN as Exclude<
      SignOptions["expiresIn"],
      undefined
    >,
  });

  const tmdbClient = env.TMDB_READ_ACCESS_TOKEN
    ? new TmdbHttpClient({
        baseUrl: env.TMDB_BASE_URL,
        readAccessToken: env.TMDB_READ_ACCESS_TOKEN,
        defaultLanguage: env.TMDB_DEFAULT_LANGUAGE,
        defaultRegion: env.TMDB_DEFAULT_REGION,
        requestTimeoutMs: env.TMDB_REQUEST_TIMEOUT_MS,
      })
    : {
        async getWork(request: {
          provider: "tmdb";
          params: { target: "work"; externalId: number | string; type: string };
        }) {
          return {
            id: Number(request.params.externalId),
            media_type: request.params.type,
          };
        },
        async getPopularMovies() {
          return { results: [] };
        },
        async getPopularTv() {
          return { results: [] };
        },
      };
  const tmdbMediaSyncProvider = new TmdbMediaSyncProvider(tmdbClient);
  const mangadexMediaSyncProvider = new MangadexMediaSyncProvider({
    async getWorkOrFeed(request: {
      provider: "mangadex";
      params: { target: "work"; externalId: number | string; type: string };
    }) {
      return {
        data: {
          id: String(request.params.externalId),
        },
      };
    },
  });

  const bodyValidator = new ZodBodyValidator();
  const auth = createAuthModule({
    userRepository,
    passwordHasher,
    tokenService,
    http: { bodyValidator },
  });
  const authApi = auth.api;
  const mediaApi = createMediaModule({
    providers: [tmdbMediaSyncProvider, mangadexMediaSyncProvider],
    repository: mediaSyncRepository,
  });
  const logger = options.logger ?? createLogger(env);
  const app = createHttpApp({ auth, mediaApi, logger });
  const scheduler = new MediaSyncScheduler(
    mediaApi,
    env,
    options.schedule ?? disabledSchedule,
  );

  return {
    pgPool,
    auth,
    authApi,
    mediaApi,
    app,
    logger,
    scheduler,
  };
}

export type AppContainer = ReturnType<typeof createContainer>;
