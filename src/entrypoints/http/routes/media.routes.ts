import { type RequestHandler, Router } from "express";

import type { AuthApi } from "@auth";

import type { MediaSyncController } from "../controllers/media-sync.controller.js";
import { createAuthenticate } from "../middleware/authenticate.js";

import { MEDIA_ROUTES, type MediaRouteDefinition } from "./endpoints.js";

export function createMediaRouter(
  controller: MediaSyncController,
  authApi: AuthApi,
): Router {
  const router = Router();
  const authenticate = createAuthenticate(authApi);
  const handlers: Record<MediaRouteDefinition["id"], RequestHandler> = {
    sync: controller.sync
  };

  MEDIA_ROUTES.forEach((route) => {
    const method = route.method.toLowerCase() as "post";
    router[method](route.path, authenticate, handlers[route.id]);
  });

  return router;
}
