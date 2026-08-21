import { type Application, type RequestHandler, Router } from "express";

import type {
  HttpMethod,
  HttpModuleDefinition,
} from "@shared/http/contracts/http-module-definition.js";

export interface FlatHttpEndpoint {
  method: HttpMethod;
  path: string;
}

const normalizePath = (...segments: ReadonlyArray<string>): string => {
  const path = segments
    .flatMap((segment) => segment.split("/"))
    .filter(Boolean)
    .join("/");

  return path ? `/${path}` : "/";
};

export const flattenHttpEndpoints = (
  modules: ReadonlyArray<HttpModuleDefinition>,
): ReadonlyArray<FlatHttpEndpoint> => {
  return modules.flatMap(({ basePath, routes }) =>
    routes.map(({ method, path }) => ({
      method,
      path: normalizePath(basePath, path),
    })),
  );
};

const assertNoRouteCollisions = (
  modules: ReadonlyArray<HttpModuleDefinition>,
): void => {
  const registeredEndpoints = new Set<string>();

  for (const endpoint of flattenHttpEndpoints(modules)) {
    const key = `${endpoint.method} ${endpoint.path}`;
    if (registeredEndpoints.has(key)) {
      throw new Error(`Duplicate HTTP endpoint: ${key}`);
    }
    registeredEndpoints.add(key);
  }
};

export const registerHttpModules = (
  app: Application,
  modules: ReadonlyArray<HttpModuleDefinition>,
  authenticate: RequestHandler,
): void => {
  assertNoRouteCollisions(modules);

  for (const module of modules) {
    const router = Router();

    for (const route of module.routes) {
      const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
      const path = normalizePath(route.path);
      const handlers =
        route.access === "authenticated"
          ? [authenticate, route.handler]
          : [route.handler];

      router[method](path, ...handlers);
    }

    app.use(normalizePath(module.basePath), router);
  }
};
