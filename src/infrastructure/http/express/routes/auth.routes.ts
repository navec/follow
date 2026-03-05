import { type RequestHandler, Router } from "express";

import type { TokenServicePort } from "@application/auth/ports/out/token-service.port.js";

import type { AuthController } from "../controllers/auth.controller.js";
import { createRequireAuth } from "../middleware/require-auth.js";

import { AUTH_ROUTES, type AuthRouteDefinition } from "./endpoints.js";

export function createAuthRouter(
  controller: AuthController,
  tokenService: TokenServicePort,
): Router {
  const router = Router();
  const requireAuth = createRequireAuth(tokenService);
  const handlers: Record<AuthRouteDefinition["id"], RequestHandler> = {
    register: controller.register,
    login: controller.login,
    me: controller.me,
  };

  AUTH_ROUTES.forEach((route) => {
    const method = route.method.toLowerCase() as "get" | "post";
    const middlewares = route.requireAuth
      ? [requireAuth, handlers[route.id]]
      : [handlers[route.id]];

    router[method](route.path, ...middlewares);
  });

  return router;
}
