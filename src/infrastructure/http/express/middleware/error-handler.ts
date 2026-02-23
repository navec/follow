import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import {
  AuthConflictError,
  AuthError,
  AuthInvalidCredentialsError,
  AuthUnauthorizedError,
} from "@domain/auth/errors/auth-errors.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "INVALID_INPUT",
        message: "Invalid request payload",
        details: error.issues.map((issue) =>
          issue.path.length
            ? {
                path: issue.path.join("."),
                message: issue.message,
              }
            : { message: "An entry is required here. " }
        ),
      },
    });
    return;
  }

  if (error instanceof AuthConflictError) {
    res
      .status(409)
      .json({ error: { code: error.code, message: error.message } });
    return;
  }

  if (
    error instanceof AuthInvalidCredentialsError ||
    error instanceof AuthUnauthorizedError
  ) {
    res
      .status(401)
      .json({ error: { code: error.code, message: error.message } });
    return;
  }

  if (error instanceof AuthError) {
    res
      .status(400)
      .json({ error: { code: error.code, message: error.message } });
    return;
  }

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  });
};
