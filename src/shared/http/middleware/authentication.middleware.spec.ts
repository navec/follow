import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequest } from "@shared/http/context/authenticated-request.js";
import {
  createAuthenticationMiddleware,
  type ResolveIdentity,
} from "@shared/http/middleware/authentication.middleware.js";

function requestWithAuthorization(authorization?: string): Request {
  return {
    headers: authorization ? { authorization } : {},
  } as Request;
}

describe("authentication middleware", () => {
  it("resolves the bearer token and stores only the public HTTP identity", async () => {
    const identity = {
      userId: "admin-1",
      email: "admin@example.com",
      role: "admin",
      permissions: ["media:write"],
    };
    const resolveIdentity = vi.fn().mockResolvedValue(identity);
    const request = requestWithAuthorization("Bearer token");
    const next = vi.fn();

    await createAuthenticationMiddleware(resolveIdentity)(
      request,
      {} as Response,
      next as unknown as NextFunction,
    );

    expect(resolveIdentity).toHaveBeenCalledWith("token");
    expect(request as AuthenticatedRequest).toHaveProperty("identity", identity);
    expect(request).not.toHaveProperty("user");
    expect(next).toHaveBeenCalledWith();
  });

  it.each([undefined, "Bearer    "])(
    "forwards its own public unauthorized error for token %s",
    async (authorization) => {
      const resolveIdentity: ResolveIdentity = vi.fn();
      const next = vi.fn();

      await createAuthenticationMiddleware(resolveIdentity)(
        requestWithAuthorization(authorization),
        {} as Response,
        next as unknown as NextFunction,
      );

      expect(resolveIdentity).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "UNAUTHORIZED",
          message: "Unauthorized",
        }),
      );
    },
  );
});
