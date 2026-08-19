import { type RequestHandler, Router } from "express";

import type { AuthApi } from "@auth";

import type { AuthController } from "../controllers/auth.controller.js";
import { createAuthenticate } from "../middleware/authenticate.js";

import { AUTH_ROUTES, type AuthRouteDefinition } from "./endpoints.js";

export function createAuthRouter(
  controller: AuthController,
  authApi: AuthApi,
): Router {
  const router = Router();
  const authenticate = createAuthenticate(authApi);
  const handlers: Record<AuthRouteDefinition["id"], RequestHandler> = {
    register: controller.register,
    login: controller.login,
    me: controller.me,
  };

  AUTH_ROUTES.forEach((route) => {
    const method = route.method.toLowerCase() as "get" | "post";
    const middlewares = route.requireAuth
      ? [authenticate, handlers[route.id]]
      : [handlers[route.id]];

    router[method](route.path, ...middlewares);
  });

  return router;
}
