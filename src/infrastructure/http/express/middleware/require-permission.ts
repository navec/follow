import type { NextFunction, Request, Response } from "express";

import type { UserRepositoryPort } from "@auth-internal/application/ports/out/user-repository.port.js";
import type { AuthorizationService } from "@auth-internal/application/services/authorization.service.js";
import type { User } from "@auth-internal/domain/entities/user.js";
import { AuthForbiddenError, AuthUnauthorizedError } from "@auth-internal/domain/errors/auth-errors.js";

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
