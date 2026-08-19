import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import type { AuthApi } from "@auth";

import { createAuthenticate } from "./authenticate.js";

function requestWithAuthorization(authorization?: string): Request {
  return {
    headers: authorization ? { authorization } : {},
  } as Request;
}

describe("authenticate", () => {
  it("uses AuthApi and stores only the public identity", async () => {
    const identity = {
      userId: "admin-1",
      email: "admin@example.com",
      role: "admin",
      permissions: ["media:write"],
    };
    const authApi = {
      register: vi.fn(),
      login: vi.fn(),
      authenticate: vi.fn().mockResolvedValue(identity),
    } satisfies AuthApi;
    const request = requestWithAuthorization("Bearer token");
    const next = vi.fn();

    await createAuthenticate(authApi)(
      request,
      {} as Response,
      next as unknown as NextFunction,
    );

    expect(authApi.authenticate).toHaveBeenCalledWith("token");
    expect(request).toHaveProperty("identity", identity);
    expect(request).not.toHaveProperty("user");
    expect(next).toHaveBeenCalledWith();
  });

  it("passes an Auth public error when the bearer token is absent", async () => {
    const authApi = {
      register: vi.fn(),
      login: vi.fn(),
      authenticate: vi.fn(),
    } satisfies AuthApi;
    const next = vi.fn();

    await createAuthenticate(authApi)(
      requestWithAuthorization(),
      {} as Response,
      next as unknown as NextFunction,
    );

    expect(authApi.authenticate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UNAUTHORIZED" }),
    );
  });
});
