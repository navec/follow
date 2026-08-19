import type { NextFunction, Request, Response } from "express";

import type { AuthApi } from "@auth";

import type { AuthenticatedRequest } from "../context/authenticated-request.js";
import { authPresenter } from "../presenters/auth.presenter.js";
import {
  loginSchema,
  registerSchema,
} from "../validation/schemas/auth.schemas.js";
import type { BodyValidator } from "../validation/validator.js";

interface AuthControllerDeps {
  authApi: AuthApi;
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
      const result = await this.deps.authApi.register(input);
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
      const result = await this.deps.authApi.login(input);
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
      if (!req.identity) {
        throw new Error("Missing auth context");
      }
      res.status(200).json(authPresenter.me(req.identity));
    } catch (error) {
      next(error);
    }
  };
}
