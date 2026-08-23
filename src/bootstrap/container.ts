import type { SignOptions } from "jsonwebtoken";
import type { Logger } from "pino";

import { PgUserRepository } from "@auth/adapters/out/postgres/pg-user.repository.js";
import { Argon2PasswordHasher } from "@auth/adapters/out/security/argon2-password-hasher.js";
import { JwtTokenService } from "@auth/adapters/out/security/jwt-token-service.js";
import { createAuthModule } from "@auth/auth.module.js";
import { MangadexMediaSyncProvider } from "@media/adapters/out/mangadex/mangadex-media-sync.provider.js";
import { PgMediaSyncRepository } from "@media/adapters/out/postgres/pg-media-sync.repository.js";
import { TmdbHttpClient } from "@media/adapters/out/tmdb/tmdb-http.client.js";
import { TmdbMediaSyncProvider } from "@media/adapters/out/tmdb/tmdb-media-sync.provider.js";
import { createMediaModule } from "@media/media.module.js";
import type { AppEnv } from "@platform/config/index.js";
import { createPgPool } from "@platform/database/pg-client.js";
import { createLogger } from "@platform/logging/logger.js";
import { createHttpApp } from "@bootstrap/http/app.js";
import { ZodBodyValidator } from "@shared/http/validation/zod-validator.js";

interface ContainerOptions {
  logger?: Logger;
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
        imageBaseUrl: env.TMDB_IMAGE_BASE_URL,
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
        getImageUrl(filePath: string) {
          return `${env.TMDB_IMAGE_BASE_URL.replace(/\/$/, "")}/${filePath.replace(/^\//, "")}`;
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
  const media = createMediaModule({
    providers: [tmdbMediaSyncProvider, mangadexMediaSyncProvider],
    repository: mediaSyncRepository,
    http: { bodyValidator },
    scheduler: { tmdbFeedCron: env.MEDIA_SYNC_TMDB_FEED_CRON },
  });
  const mediaApi = media.api;
  const logger = options.logger ?? createLogger(env);
  const http = createHttpApp({ auth, media, logger });

  return {
    pgPool,
    auth,
    authApi,
    media,
    mediaApi,
    app: http.app,
    httpEndpoints: http.endpoints,
    logger,
  };
}

export type AppContainer = ReturnType<typeof createContainer>;
