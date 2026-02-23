import type { NextFunction, Request, Response } from "express";

import type { GetCurrentUserUseCase } from "@application/auth/use-cases/get-current-user.use-case.js";
import type { LoginUserUseCase } from "@application/auth/use-cases/login-user.use-case.js";
import type { RegisterUserUseCase } from "@application/auth/use-cases/register-user.use-case.js";

import { authPresenter } from "../presenters/auth.presenter.js";
import {
  loginSchema,
  registerSchema,
} from "../validation/schemas/auth.schemas.js";
import type { BodyValidator } from "../validation/validator.js";

interface AuthContext {
  sub: string;
  email: string;
}

type AuthenticatedRequest = Request & { auth?: AuthContext };

interface AuthControllerDeps {
  registerUserUseCase: RegisterUserUseCase;
  loginUserUseCase: LoginUserUseCase;
  getCurrentUserUseCase: GetCurrentUserUseCase;
  bodyValidator: BodyValidator;
}

export class AuthController {
  constructor(private readonly deps: AuthControllerDeps) {}

  register = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const input = this.deps.bodyValidator.parse(registerSchema, req.body);
      const result = await this.deps.registerUserUseCase.execute(input);
      res.status(201).json(authPresenter.auth(result));
    } catch (error) {
      next(error);
    }
  };

  login = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const input = this.deps.bodyValidator.parse(loginSchema, req.body);
      const result = await this.deps.loginUserUseCase.execute(input);
      res.status(200).json(authPresenter.auth(result));
    } catch (error) {
      next(error);
    }
  };

  me = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.auth?.sub) {
        throw new Error("Missing auth context");
      }
      const result = await this.deps.getCurrentUserUseCase.execute({
        userId: req.auth.sub,
      });
      res.status(200).json(authPresenter.me(result));
    } catch (error) {
      next(error);
    }
  };
}
