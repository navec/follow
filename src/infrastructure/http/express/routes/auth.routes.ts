import { Router } from "express";

import type { TokenServicePort } from "@application/auth/ports/out/token-service.port.js";

import type { AuthController } from "../controllers/auth.controller.js";
import { createRequireAuth } from "../middleware/require-auth.js";

export function createAuthRouter(controller: AuthController, tokenService: TokenServicePort): Router {
  const router = Router();
  const requireAuth = createRequireAuth(tokenService);

  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.get("/me", requireAuth, controller.me);

  return router;
}
