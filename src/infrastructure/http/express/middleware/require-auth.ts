import type { NextFunction, Request, Response } from "express";

import { AuthUnauthorizedError } from "@domain/auth/errors/auth-errors.js";
import type { TokenServicePort } from "@application/auth/ports/out/token-service.port.js";

type AuthenticatedRequest = Request & { auth?: { sub: string; email: string } };

export function createRequireAuth(tokenService: TokenServicePort) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        throw new AuthUnauthorizedError();
      }

      const token = header.slice("Bearer ".length).trim();
      if (!token) {
        throw new AuthUnauthorizedError();
      }

      req.auth = tokenService.verifyAccessToken(token);
      next();
    } catch {
      next(new AuthUnauthorizedError());
    }
  };
}
