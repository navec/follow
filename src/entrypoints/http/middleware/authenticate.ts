import type { NextFunction, RequestHandler, Response } from "express";

import { type AuthApi,AuthUnauthorizedError } from "@auth";

import type { AuthenticatedRequest } from "../context/authenticated-request.js";

export function createAuthenticate(authApi: AuthApi): RequestHandler {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(new AuthUnauthorizedError());
      return;
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      next(new AuthUnauthorizedError());
      return;
    }

    try {
      req.identity = await authApi.authenticate(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}
