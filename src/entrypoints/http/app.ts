import express, { type RequestHandler } from "express";

import { createErrorHandler } from "../../shared/http/error-handler.js";
import { createAuthenticationMiddleware } from "../../shared/http/middleware/authentication.middleware.js";
import { createRequestLoggerMiddleware } from "../../shared/http/middleware/request-logger.middleware.js";
import { registerHttpModules } from "../../shared/http/route-registry.js";

import {
  ROOT_ROUTES,
  type RootRouteDefinition,
} from "./routes/endpoints.js";
import type { CreateHttpApp } from "./types.js";

export const createHttpApp: CreateHttpApp = (deps) => {
  const app = express();

  const rootHandlers: Record<RootRouteDefinition["id"], RequestHandler> = {
    health: (_req, res) => {
      res.status(200).json({ data: { status: "ok" } });
    },
  };
  app.use(express.json());
  app.use(createRequestLoggerMiddleware(deps.logger));

  ROOT_ROUTES.forEach((route) => {
    const method = route.method.toLowerCase() as "get";
    app[method](route.path, rootHandlers[route.id]);
  });

  registerHttpModules(
    app,
    [deps.auth.http, ...(deps.media ? [deps.media.http] : [])],
    createAuthenticationMiddleware((token) => deps.auth.api.authenticate(token)),
  );

  app.use(createErrorHandler(deps.logger));

  return app;
};
