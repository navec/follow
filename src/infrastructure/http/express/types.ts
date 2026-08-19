import type { Express } from "express";
import type { Logger } from "pino";

import type { TokenServicePort } from "@auth-internal/application/ports/out/token-service.port.js";
import type { UserRepositoryPort } from "@auth-internal/application/ports/out/user-repository.port.js";
import type { GetCurrentUserUseCase } from "@auth-internal/application/use-cases/get-current-user.use-case.js";
import type { LoginUserUseCase } from "@auth-internal/application/use-cases/login-user.use-case.js";
import type { RegisterUserUseCase } from "@auth-internal/application/use-cases/register-user.use-case.js";
import type { SyncRequest } from "@application/media/dto/sync-request.dto.js";
import type { SyncResult } from "@application/media/dto/sync-result.dto.js";
import type { MediaActor } from "@application/media/models/media-actor.js";
import type { MediaAuthorizationPolicy } from "@application/media/services/media-authorization.policy.js";

export type CreateHttpApp = (deps: {
  registerUserUseCase: RegisterUserUseCase;
  loginUserUseCase: LoginUserUseCase;
  getCurrentUserUseCase: GetCurrentUserUseCase;
  tokenService: TokenServicePort;
  logger: Logger;
  userRepository?: UserRepositoryPort;
  mediaAuthorizationPolicy?: MediaAuthorizationPolicy;
  syncMediaUseCase?: {
    execute(request: SyncRequest, actor: MediaActor): Promise<SyncResult>;
  };
}) => Express;
