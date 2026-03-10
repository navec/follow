import express, { type Express, type RequestHandler } from "express";
import type { Logger } from "pino";

import type { TokenServicePort } from "@application/auth/ports/out/token-service.port.js";
import type { GetCurrentUserUseCase } from "@application/auth/use-cases/get-current-user.use-case.js";
import type { LoginUserUseCase } from "@application/auth/use-cases/login-user.use-case.js";
import type { RegisterUserUseCase } from "@application/auth/use-cases/register-user.use-case.js";
import { AuthorizationService } from "@application/auth/services/authorization.service.js";
import type { UserRepositoryPort } from "@application/auth/ports/out/user-repository.port.js";
import type { SyncRequest } from "@application/media/dto/sync-request.dto.js";
import type { SyncResult } from "@application/media/dto/sync-result.dto.js";
import type { User } from "@domain/auth/entities/user.js";

import { AuthController } from "./controllers/auth.controller.js";
import { MediaSyncController } from "./controllers/media-sync.controller.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createRequestLoggerMiddleware } from "./middleware/request-logger.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createMediaRouter } from "./routes/media.routes.js";
import {
  ROOT_ROUTES,
  type RootRouteDefinition,
  ROUTE_GROUPS,
} from "./routes/endpoints.js";
import { ZodBodyValidator } from "./validation/zod-validator.js";

export interface HttpAppDeps {
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
}

export function createHttpApp(deps: HttpAppDeps): Express {
  const app = express();
  const authController = new AuthController({
    registerUserUseCase: deps.registerUserUseCase,
    loginUserUseCase: deps.loginUserUseCase,
    getCurrentUserUseCase: deps.getCurrentUserUseCase,
    bodyValidator: new ZodBodyValidator(),
  });

  const rootHandlers: Record<RootRouteDefinition["id"], RequestHandler> = {
    health: (_req, res) => {
      res.status(200).json({ data: { status: "ok" } });
    },
  };
  const authRouter = createAuthRouter(authController, deps.tokenService);
  const mediaRouter =
    deps.syncMediaUseCase && deps.userRepository && deps.authorizationService
      ? createMediaRouter(
          new MediaSyncController({
            syncMediaUseCase: deps.syncMediaUseCase,
            bodyValidator: new ZodBodyValidator(),
          }),
          deps.tokenService,
          deps.userRepository,
          deps.authorizationService
        )
      : null;

  app.use(express.json());
  app.use(createRequestLoggerMiddleware(deps.logger));

  ROOT_ROUTES.forEach((route) => {
    const method = route.method.toLowerCase() as "get";
    app[method](route.path, rootHandlers[route.id]);
  });

  ROUTE_GROUPS.filter((group) => group.id !== "root").forEach((group) => {
    if (group.id === "auth") {
      app.use(group.basePath, authRouter);
      return;
    }

    if (group.id === "media" && mediaRouter) {
      app.use(group.basePath, mediaRouter);
    }
  });

  app.use(errorHandler);

  return app;
}
