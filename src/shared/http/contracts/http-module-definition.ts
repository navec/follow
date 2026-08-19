import type { RequestHandler } from "express";

export type HttpMethod = "GET" | "POST";
export type HttpAccess = "public" | "authenticated";

export interface HttpRouteDefinition {
  method: HttpMethod;
  path: string;
  access: HttpAccess;
  handler: RequestHandler;
}

export interface HttpModuleDefinition {
  id: string;
  basePath: string;
  routes: ReadonlyArray<HttpRouteDefinition>;
}
