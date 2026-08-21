import type { NextFunction, RequestHandler, Response } from "express";

import type {
  AuthenticatedHttpIdentity,
  AuthenticatedRequest,
} from "@shared/http/context/authenticated-request.js";

export type ResolveIdentity = (
  accessToken: string,
) => Promise<AuthenticatedHttpIdentity>;

class HttpUnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED";

  constructor() {
    super("Unauthorized");
  }
}

export function createAuthenticationMiddleware(
  resolveIdentity: ResolveIdentity,
): RequestHandler {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(new HttpUnauthorizedError());
      return;
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      next(new HttpUnauthorizedError());
      return;
    }

    try {
      req.identity = await resolveIdentity(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}
