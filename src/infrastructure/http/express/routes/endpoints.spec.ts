import { describe, expect, it } from "vitest";

import { AUTH_ROUTES, flattenEndpoints, MEDIA_ROUTES, ROOT_ROUTES, ROUTE_GROUPS } from "./endpoints.js";

describe("routes/endpoints", () => {
  it("defines route groups used by app mounting", () => {
    expect(ROUTE_GROUPS).toEqual([
      { id: "root", basePath: "", routes: ROOT_ROUTES },
      { id: "auth", basePath: "/auth", routes: AUTH_ROUTES },
      { id: "media", basePath: "/media", routes: MEDIA_ROUTES }
    ]);
  });

  it("flattens all endpoints for startup logs", () => {
    expect(flattenEndpoints()).toEqual([
      { method: "GET", path: "/health" },
      { method: "POST", path: "/auth/register" },
      { method: "POST", path: "/auth/login" },
      { method: "GET", path: "/auth/me" },
      { method: "POST", path: "/media/sync" }
    ]);
  });
});
