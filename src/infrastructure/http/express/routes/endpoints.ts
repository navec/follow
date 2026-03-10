export type HttpMethod = "GET" | "POST";

export interface RouteDefinition {
  id: string;
  method: HttpMethod;
  path: string;
}

export interface RouteGroupDefinition {
  id: "root" | "auth" | "media";
  basePath: "" | "/auth" | "/media";
  routes: ReadonlyArray<RouteDefinition>;
}

export type RootRouteDefinition = RouteDefinition & {
  id: "health";
  path: "/health";
  method: "GET";
};

export type AuthRouteDefinition = RouteDefinition & {
  id: "register" | "login" | "me";
  path: "/register" | "/login" | "/me";
  method: "GET" | "POST";
  requireAuth: boolean;
};

export type MediaRouteDefinition = RouteDefinition & {
  id: "sync";
  path: "/sync";
  method: "POST";
  requireAuth: true;
};

export const ROOT_ROUTES: ReadonlyArray<RootRouteDefinition> = [
  { id: "health", method: "GET", path: "/health" },
];

export const AUTH_ROUTES: ReadonlyArray<AuthRouteDefinition> = [
  { id: "register", method: "POST", path: "/register", requireAuth: false },
  { id: "login", method: "POST", path: "/login", requireAuth: false },
  { id: "me", method: "GET", path: "/me", requireAuth: true },
];

export const MEDIA_ROUTES: ReadonlyArray<MediaRouteDefinition> = [
  { id: "sync", method: "POST", path: "/sync", requireAuth: true }
];

export const ROUTE_GROUPS: ReadonlyArray<RouteGroupDefinition> = [
  { id: "root", basePath: "", routes: ROOT_ROUTES },
  { id: "auth", basePath: "/auth", routes: AUTH_ROUTES },
  { id: "media", basePath: "/media", routes: MEDIA_ROUTES }
];

export interface FlatEndpoint {
  method: HttpMethod;
  path: string;
}

const normalizePath = (basePath: string, path: string): string => {
  return basePath ? `${basePath}${path}` : path;
};

export const flattenEndpoints = (
  routeGroups: ReadonlyArray<RouteGroupDefinition> = ROUTE_GROUPS,
): ReadonlyArray<FlatEndpoint> => {
  return routeGroups.flatMap(({ routes, basePath }) =>
    routes.map(({ method, path }) => {
      return { method, path: normalizePath(basePath, path) };
    }),
  );
};
