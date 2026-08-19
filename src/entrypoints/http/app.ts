import express, { type RequestHandler } from "express";

import { AuthController } from "./controllers/auth.controller.js";
import { MediaSyncController } from "./controllers/media-sync.controller.js";
import { createRequestLoggerMiddleware } from "./middleware/request-logger.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import {
  ROOT_ROUTES,
  type RootRouteDefinition,
  ROUTE_GROUPS,
} from "./routes/endpoints.js";
import { createMediaRouter } from "./routes/media.routes.js";
import { ZodBodyValidator } from "./validation/zod-validator.js";
import { createErrorHandler } from "./error-handler.js";
import type { CreateHttpApp } from "./types.js";

export const createHttpApp: CreateHttpApp = (deps) => {
  const app = express();

  const authController = new AuthController({
    authApi: deps.authApi,
    bodyValidator: new ZodBodyValidator(),
  });

  const rootHandlers: Record<RootRouteDefinition["id"], RequestHandler> = {
    health: (_req, res) => {
      res.status(200).json({ data: { status: "ok" } });
    },
  };
  const authRouter = createAuthRouter(authController, deps.authApi);
  const mediaRouter = deps.mediaApi
      ? createMediaRouter(
          new MediaSyncController({
            mediaApi: deps.mediaApi,
            bodyValidator: new ZodBodyValidator(),
          }),
          deps.authApi,
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

  app.use(createErrorHandler(deps.logger));

  return app;
};
