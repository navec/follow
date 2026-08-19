import { randomUUID } from "node:crypto";

import type { ErrorRequestHandler, Request } from "express";
import { ZodError } from "zod";

interface ErrorLogger {
  error(bindings: object, message: string): void;
}

interface PublicError extends Error {
  code: string;
}

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  INVALID_INPUT: 400,
  PASSWORD_MISMATCH: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  EMAIL_ALREADY_USED: 409,
  PROVIDER_FAILED: 502,
  PROVIDER_UNAVAILABLE: 502,
  PERSISTENCE_UNAVAILABLE: 503,
  PROVIDER_TIMEOUT: 504,
};

function requestIdOf(request: Request): string {
  const requestWithId = request as Request & { id?: unknown };
  return typeof requestWithId.id === "string" && requestWithId.id.length > 0
    ? requestWithId.id
    : randomUUID();
}

function isPublicError(error: unknown): error is PublicError {
  return (
    error instanceof Error &&
    typeof (error as Partial<PublicError>).code === "string" &&
    STATUS_BY_CODE[(error as PublicError).code] !== undefined
  );
}

export function createErrorHandler(logger: ErrorLogger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    const requestId = requestIdOf(req);

    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "Invalid request payload",
          details: error.issues.map((issue) =>
            issue.path.length
              ? { path: issue.path.join("."), message: issue.message }
              : { message: "An entry is required here. " },
          ),
          requestId,
        },
      });
      return;
    }

    if (isPublicError(error)) {
      res.status(STATUS_BY_CODE[error.code]!).json({
        error: { code: error.code, message: error.message, requestId },
      });
      return;
    }

    logger.error({ error, requestId }, "Unhandled HTTP error");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        requestId,
      },
    });
  };
}
