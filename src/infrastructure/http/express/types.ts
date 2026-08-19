import type { Express } from "express";
import type { Logger } from "pino";

import type { User } from "@domain/auth/entities/user.js";
import type { TokenServicePort } from "@application/auth/ports/out/token-service.port.js";
import type { UserRepositoryPort } from "@application/auth/ports/out/user-repository.port.js";
import type { AuthorizationService } from "@application/auth/services/authorization.service.js";
import type { GetCurrentUserUseCase } from "@application/auth/use-cases/get-current-user.use-case.js";
import type { LoginUserUseCase } from "@application/auth/use-cases/login-user.use-case.js";
import type { RegisterUserUseCase } from "@application/auth/use-cases/register-user.use-case.js";
import type { SyncRequest } from "@application/media/dto/sync-request.dto.js";
import type { SyncResult } from "@application/media/dto/sync-result.dto.js";

export type CreateHttpApp = (deps: {
  registerUserUseCase: RegisterUserUseCase;
  loginUserUseCase: LoginUserUseCase;
  getCurrentUserUseCase: GetCurrentUserUseCase;
  tokenService: TokenServicePort;
  logger: Logger;
  userRepository?: UserRepositoryPort;
  authorizationService?: AuthorizationService;
  syncMediaUseCase?: {
    execute(request: SyncRequest, actor: User): Promise<SyncResult>;
  };
}) => Express;
