import { AuthController } from "@auth/entrypoints/http/auth.controller.js";
import type { AuthApi } from "@auth/public/auth-api.js";
import type { HttpModuleDefinition } from "@shared/http/contracts/http-module-definition.js";
import type { BodyValidator } from "@shared/http/validation/validator.js";

interface AuthHttpDependencies {
  api: AuthApi;
  bodyValidator: BodyValidator;
}

export function createAuthHttpDefinition({
  api,
  bodyValidator,
}: AuthHttpDependencies): HttpModuleDefinition {
  const controller = new AuthController({ authApi: api, bodyValidator });

  return {
    id: "auth",
    basePath: "/auth",
    routes: [
      { method: "POST", path: "/register", access: "public", handler: controller.register },
      { method: "POST", path: "/login", access: "public", handler: controller.login },
      { method: "GET", path: "/me", access: "authenticated", handler: controller.me },
    ],
  };
}
