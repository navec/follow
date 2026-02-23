import type { SignOptions } from "jsonwebtoken";

import { GetCurrentUserUseCase } from "@application/auth/use-cases/get-current-user.use-case.js";
import { LoginUserUseCase } from "@application/auth/use-cases/login-user.use-case.js";
import { RegisterUserUseCase } from "@application/auth/use-cases/register-user.use-case.js";
import type { AppEnv } from "@infrastructure/config/index.js";
import { createPgPool } from "@infrastructure/persistence/postgres/pg-client.js";
import { PgUserRepository } from "@infrastructure/persistence/postgres/repositories/pg-user.repository.js";
import { Argon2PasswordHasher } from "@infrastructure/security/argon2-password-hasher.js";
import { JwtTokenService } from "@infrastructure/security/jwt-token-service.js";

export function createContainer(env: AppEnv) {
  const pgPool = createPgPool(env.DATABASE_URL);
  const userRepository = new PgUserRepository(pgPool);
  const passwordHasher = new Argon2PasswordHasher();
  const tokenService = new JwtTokenService({
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN as Exclude<SignOptions["expiresIn"], undefined>
  });

  const registerUserUseCase = new RegisterUserUseCase(userRepository, passwordHasher, tokenService);
  const loginUserUseCase = new LoginUserUseCase(userRepository, passwordHasher, tokenService);
  const getCurrentUserUseCase = new GetCurrentUserUseCase(userRepository);

  return {
    pgPool,
    userRepository,
    passwordHasher,
    tokenService,
    registerUserUseCase,
    loginUserUseCase,
    getCurrentUserUseCase
  };
}

export type AppContainer = ReturnType<typeof createContainer>;
