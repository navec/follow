import express, { type Express } from "express";

import type { TokenServicePort } from "@application/auth/ports/out/token-service.port.js";
import type { GetCurrentUserUseCase } from "@application/auth/use-cases/get-current-user.use-case.js";
import type { LoginUserUseCase } from "@application/auth/use-cases/login-user.use-case.js";
import type { RegisterUserUseCase } from "@application/auth/use-cases/register-user.use-case.js";

import { AuthController } from "./controllers/auth.controller.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { ZodBodyValidator } from "./validation/zod-validator.js";

export interface HttpAppDeps {
  registerUserUseCase: RegisterUserUseCase;
  loginUserUseCase: LoginUserUseCase;
  getCurrentUserUseCase: GetCurrentUserUseCase;
  tokenService: TokenServicePort;
}

export function createHttpApp(deps: HttpAppDeps): Express {
  const app = express();
  const authController = new AuthController({
    registerUserUseCase: deps.registerUserUseCase,
    loginUserUseCase: deps.loginUserUseCase,
    getCurrentUserUseCase: deps.getCurrentUserUseCase,
    bodyValidator: new ZodBodyValidator()
  });

  app.use(express.json());
  app.get("/health", (_req, res) => {
    res.status(200).json({ data: { status: "ok" } });
  });
  app.use("/auth", createAuthRouter(authController, deps.tokenService));
  app.use(errorHandler);

  return app;
}
