import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { HttpModuleDefinition } from "@shared/http/contracts/http-module-definition.js";
import { flattenHttpEndpoints, registerHttpModules } from "@shared/http/route-registry.js";

const noContent: RequestHandler = (_request, response) => {
  response.status(204).end();
};

const ok: RequestHandler = (_request, response) => {
  response.status(200).json({ data: { status: "ok" } });
};

const createModules = (): ReadonlyArray<HttpModuleDefinition> => [
  {
    id: "public",
    basePath: "/public/",
    routes: [
      { method: "GET", path: "/ping", access: "public", handler: ok },
    ],
  },
  {
    id: "private",
    basePath: "/private",
    routes: [
      {
        method: "POST",
        path: "action",
        access: "authenticated",
        handler: noContent,
      },
    ],
  },
];

describe("HTTP route registry", () => {
  it("registers public and authenticated routes under their module paths", async () => {
    const app = express();
    const authenticate: RequestHandler = vi.fn((_request, _response, next) => {
      next();
    });

    registerHttpModules(app, createModules(), authenticate);

    expect(await request(app).get("/public/ping")).toMatchObject({ status: 200 });
    expect(authenticate).not.toHaveBeenCalled();

    expect(await request(app).post("/private/action")).toMatchObject({ status: 204 });
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it("flattens endpoints in module and route order with normalized full paths", () => {
    expect(flattenHttpEndpoints(createModules())).toEqual([
      { method: "GET", path: "/public/ping" },
      { method: "POST", path: "/private/action" },
    ]);
  });

  it("rejects duplicate method and full-path definitions before registration", async () => {
    const app = express();
    const duplicateModules: ReadonlyArray<HttpModuleDefinition> = [
      ...createModules(),
      {
        id: "duplicate",
        basePath: "/public",
        routes: [
          { method: "GET", path: "ping/", access: "public", handler: ok },
        ],
      },
    ];

    expect(() => {
      registerHttpModules(app, duplicateModules, vi.fn());
    }).toThrow("Duplicate HTTP endpoint: GET /public/ping");
    expect(await request(app).get("/public/ping")).toMatchObject({ status: 404 });
  });
});
