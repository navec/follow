import { type RequestHandler, Router } from "express";

import type { TokenServicePort } from "@auth-internal/application/ports/out/token-service.port.js";
import type { UserRepositoryPort } from "@auth-internal/application/ports/out/user-repository.port.js";
import type { MediaAuthorizationPolicy } from "@application/media/services/media-authorization.policy.js";

import type { MediaSyncController } from "../controllers/media-sync.controller.js";
import { createRequireAuth } from "../middleware/require-auth.js";
import { createRequirePermission } from "../middleware/require-permission.js";

import { MEDIA_ROUTES, type MediaRouteDefinition } from "./endpoints.js";

export function createMediaRouter(
  controller: MediaSyncController,
  tokenService: TokenServicePort,
  userRepository: UserRepositoryPort,
  mediaAuthorizationPolicy: MediaAuthorizationPolicy
): Router {
  const router = Router();
  const requireAuth = createRequireAuth(tokenService);
  const requirePermission = createRequirePermission(
    userRepository,
    mediaAuthorizationPolicy
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
