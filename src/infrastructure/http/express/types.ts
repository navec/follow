import type { Express } from "express";
import type { Logger } from "pino";

import type { TokenServicePort } from "@auth-internal/application/ports/out/token-service.port.js";
import type { UserRepositoryPort } from "@auth-internal/application/ports/out/user-repository.port.js";
import type { AuthorizationService } from "@auth-internal/application/services/authorization.service.js";
import type { GetCurrentUserUseCase } from "@auth-internal/application/use-cases/get-current-user.use-case.js";
import type { LoginUserUseCase } from "@auth-internal/application/use-cases/login-user.use-case.js";
import type { RegisterUserUseCase } from "@auth-internal/application/use-cases/register-user.use-case.js";
import type { User } from "@auth-internal/domain/entities/user.js";
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
