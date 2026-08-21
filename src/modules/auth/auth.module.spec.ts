import { describe, expect, it, vi } from "vitest";

import { createAuthModule } from "@auth/auth.module.js";
import type { BodyValidator } from "@shared/http/validation/validator.js";

describe("createAuthModule", () => {
  it("exposes its public API and declarative HTTP contribution", () => {
    const bodyValidator: BodyValidator = {
      parse: vi.fn((_schema, input) => input) as BodyValidator["parse"],
    };

    const auth = createAuthModule({
      userRepository: {
        findByEmail: vi.fn(),
        findById: vi.fn(),
        create: vi.fn(),
      },
      passwordHasher: { hash: vi.fn(), verify: vi.fn() },
      tokenService: { signAccessToken: vi.fn(), verifyAccessToken: vi.fn() },
      http: { bodyValidator },
    });

    expect(auth).toMatchObject({
      api: {
        register: expect.any(Function),
        login: expect.any(Function),
        authenticate: expect.any(Function),
      },
      http: {
        id: "auth",
        basePath: "/auth",
        routes: [
          { method: "POST", path: "/register", access: "public" },
          { method: "POST", path: "/login", access: "public" },
          { method: "GET", path: "/me", access: "authenticated" },
        ],
      },
    });
  });
});
