import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { createErrorHandler } from "./error-handler.js";

function responseDouble() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

describe("HTTP error handler", () => {
  it.each([
    ["INVALID_INPUT", 400],
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
    ["EMAIL_ALREADY_USED", 409],
    ["PROVIDER_FAILED", 502],
    ["PERSISTENCE_UNAVAILABLE", 503],
    ["PROVIDER_TIMEOUT", 504],
  ])("maps public error %s to HTTP %i", (code, status) => {
    const logger = { error: vi.fn() };
    const response = responseDouble();
    const error = Object.assign(new Error("Public message"), { code });

    createErrorHandler(logger)(
      error,
      { id: "request-1" } as unknown as Request,
      response as unknown as Response,
      vi.fn() as NextFunction,
    );

    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.json).toHaveBeenCalledWith({
      error: { code, message: "Public message", requestId: "request-1" },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("masks and logs an unknown error exactly once with its request ID", () => {
    const logger = { error: vi.fn() };
    const response = responseDouble();
    const error = new Error("database password leaked");

    createErrorHandler(logger)(
      error,
      { id: "request-2" } as unknown as Request,
      response as unknown as Response,
      vi.fn() as NextFunction,
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        requestId: "request-2",
      },
    });
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      { error, requestId: "request-2" },
      "Unhandled HTTP error",
    );
  });
});
