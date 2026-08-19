import type { SignOptions } from "jsonwebtoken";

import { PgUserRepository } from "@auth-internal/adapters/out/postgres/pg-user.repository.js";
import { Argon2PasswordHasher } from "@auth-internal/adapters/out/security/argon2-password-hasher.js";
import { JwtTokenService } from "@auth-internal/adapters/out/security/jwt-token-service.js";
import { GetCurrentUserUseCase } from "@auth-internal/application/use-cases/get-current-user.use-case.js";
import { LoginUserUseCase } from "@auth-internal/application/use-cases/login-user.use-case.js";
import { RegisterUserUseCase } from "@auth-internal/application/use-cases/register-user.use-case.js";
import { MangadexMediaSyncProvider } from "@media-internal/adapters/out/mangadex/mangadex-media-sync.provider.js";
import { PgMediaSyncRepository } from "@media-internal/adapters/out/postgres/pg-media-sync.repository.js";
import { TmdbHttpClient } from "@media-internal/adapters/out/tmdb/tmdb-http.client.js";
import { TmdbMediaSyncProvider } from "@media-internal/adapters/out/tmdb/tmdb-media-sync.provider.js";
import { MediaAuthorizationPolicy } from "@media-internal/application/services/media-authorization.policy.js";
import { SyncMediaUseCase } from "@media-internal/application/use-cases/sync-media.use-case.js";
import type { AppEnv } from "@platform/config/index.js";
import { createPgPool } from "@platform/database/pg-client.js";

export function createContainer(env: AppEnv) {
  const pgPool = createPgPool(env.DATABASE_URL);
  const userRepository = new PgUserRepository(pgPool);
  const mediaSyncRepository = new PgMediaSyncRepository(pgPool);
  const passwordHasher = new Argon2PasswordHasher();
  const mediaAuthorizationPolicy = new MediaAuthorizationPolicy();
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

  const registerUserUseCase = new RegisterUserUseCase(
    userRepository,
    passwordHasher,
    tokenService,
  );
  const loginUserUseCase = new LoginUserUseCase(
    userRepository,
    passwordHasher,
    tokenService,
  );
  const getCurrentUserUseCase = new GetCurrentUserUseCase(userRepository);
  const syncMediaUseCase = new SyncMediaUseCase(
    [tmdbMediaSyncProvider, mangadexMediaSyncProvider],
    mediaSyncRepository,
    mediaAuthorizationPolicy,
  );

  return {
    pgPool,
    userRepository,
    mediaSyncRepository,
    passwordHasher,
    mediaAuthorizationPolicy,
    tokenService,
    registerUserUseCase,
    loginUserUseCase,
    getCurrentUserUseCase,
    syncMediaUseCase,
  };
}

export type AppContainer = ReturnType<typeof createContainer>;
