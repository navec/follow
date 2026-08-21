import express, { type Express, type RequestHandler } from "express";

import type { AuthModule } from "@auth/auth.module.js";
import type { MediaModule } from "@media/media.module.js";
import type { HttpModuleDefinition } from "@shared/http/contracts/http-module-definition.js";
import { createErrorHandler } from "@shared/http/error-handler.js";
import { createAuthenticationMiddleware } from "@shared/http/middleware/authentication.middleware.js";
import {
  createRequestLoggerMiddleware,
  type RequestLogger,
} from "@shared/http/middleware/request-logger.middleware.js";
import {
  type FlatHttpEndpoint,
  flattenHttpEndpoints,
  registerHttpModules,
} from "@shared/http/route-registry.js";

interface HttpLogger extends RequestLogger {
  error(bindings: object, message: string): void;
}

interface HttpAppDependencies {
  auth: AuthModule;
  media: MediaModule;
  logger: HttpLogger;
}

export interface HttpApp {
  app: Express;
  endpoints: ReadonlyArray<FlatHttpEndpoint>;
}

const healthHandler: RequestHandler = (_request, response) => {
  response.status(200).json({ data: { status: "ok" } });
};

const healthModule: HttpModuleDefinition = {
  id: "root",
  basePath: "",
  routes: [
    {
      method: "GET",
      path: "/health",
      access: "public",
      handler: healthHandler,
    },
  ],
};

export function createHttpApp({
  auth,
  media,
  logger,
}: HttpAppDependencies): HttpApp {
  const app = express();
  const modules = [healthModule, auth.http, media.http];

  app.use(express.json());
  app.use(createRequestLoggerMiddleware(logger));
  registerHttpModules(
    app,
    modules,
    createAuthenticationMiddleware((token) => auth.api.authenticate(token)),
  );
  app.use(createErrorHandler(logger));

  return { app, endpoints: flattenHttpEndpoints(modules) };
}
