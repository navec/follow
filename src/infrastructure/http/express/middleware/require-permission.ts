import type { NextFunction, Request, Response } from "express";

import type { User } from "@domain/auth/entities/user.js";
import { AuthForbiddenError, AuthUnauthorizedError } from "@domain/auth/errors/auth-errors.js";
import type { UserRepositoryPort } from "@application/auth/ports/out/user-repository.port.js";
import type { AuthorizationService } from "@application/auth/services/authorization.service.js";

type AuthenticatedRequest = Request & {
  auth?: { sub: string; email: string };
  user?: User;
};

export function createRequirePermission(
  userRepository: UserRepositoryPort,
  authorizationService: AuthorizationService
) {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.auth?.sub) {
        throw new AuthUnauthorizedError();
      }

      const user = await userRepository.findById(req.auth.sub);
      if (!user) {
        throw new AuthUnauthorizedError();
      }

      if (!authorizationService.canWriteMedia(user)) {
        throw new AuthForbiddenError();
      }

      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}
