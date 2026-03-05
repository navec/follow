import express, { type Express, type RequestHandler } from "express";
import type { Logger } from "pino";

import type { TokenServicePort } from "@application/auth/ports/out/token-service.port.js";
import type { GetCurrentUserUseCase } from "@application/auth/use-cases/get-current-user.use-case.js";
import type { LoginUserUseCase } from "@application/auth/use-cases/login-user.use-case.js";
import type { RegisterUserUseCase } from "@application/auth/use-cases/register-user.use-case.js";

import { AuthController } from "./controllers/auth.controller.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createRequestLoggerMiddleware } from "./middleware/request-logger.js";
import { createAuthRouter } from "./routes/auth.routes.js";
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

  app.use(express.json());
  app.use(createRequestLoggerMiddleware(deps.logger));

  ROOT_ROUTES.forEach((route) => {
    const method = route.method.toLowerCase() as "get";
    app[method](route.path, rootHandlers[route.id]);
  });

  ROUTE_GROUPS.filter((group) => group.id !== "root").forEach((group) => {
    app.use(group.basePath, authRouter);
  });

  app.use(errorHandler);

  return app;
}
