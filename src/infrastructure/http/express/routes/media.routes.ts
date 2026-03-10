import { type RequestHandler, Router } from "express";

import { AuthorizationService } from "@application/auth/services/authorization.service.js";
import type { UserRepositoryPort } from "@application/auth/ports/out/user-repository.port.js";
import type { TokenServicePort } from "@application/auth/ports/out/token-service.port.js";

import type { MediaSyncController } from "../controllers/media-sync.controller.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import { createRequirePermission } from "../middleware/require-permission.js";

import { MEDIA_ROUTES, type MediaRouteDefinition } from "./endpoints.js";

export function createMediaRouter(
  controller: MediaSyncController,
  tokenService: TokenServicePort,
  userRepository: UserRepositoryPort,
  authorizationService: AuthorizationService
): Router {
  const router = Router();
  const requireAuth = createRequireAuth(tokenService);
  const requirePermission = createRequirePermission(
    userRepository,
    authorizationService
  );
  const handlers: Record<MediaRouteDefinition["id"], RequestHandler> = {
    sync: controller.sync
  };

  MEDIA_ROUTES.forEach((route) => {
    const method = route.method.toLowerCase() as "post";
    router[method](route.path, requireAuth, requirePermission, handlers[route.id]);
  });

  return router;
}
