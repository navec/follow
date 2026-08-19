import type { MediaAuthorizationPolicy } from "@media-internal/application/services/media-authorization.policy.js";
import type { NextFunction, Request, Response } from "express";

import type { UserRepositoryPort } from "@auth-internal/application/ports/out/user-repository.port.js";
import type { User } from "@auth-internal/domain/entities/user.js";
import { AuthForbiddenError, AuthUnauthorizedError } from "@auth-internal/domain/errors/auth-errors.js";

type AuthenticatedRequest = Request & {
  auth?: { sub: string; email: string };
  user?: User;
};

export function createRequirePermission(
  userRepository: UserRepositoryPort,
  mediaAuthorizationPolicy: MediaAuthorizationPolicy
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

      if (!mediaAuthorizationPolicy.canSync(user)) {
        throw new AuthForbiddenError();
      }

      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}
