import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "../../domain/entities/user.js";
import { AuthUnauthorizedError } from "../../domain/errors/auth-errors.js";
import type { TokenServicePort } from "../ports/out/token-service.port.js";
import type { UserRepositoryPort } from "../ports/out/user-repository.port.js";

import { AuthenticateAccessTokenUseCase } from "./authenticate-access-token.use-case.js";

describe("AuthenticateAccessTokenUseCase", () => {
  const tokenService = {
    signAccessToken: vi.fn<TokenServicePort["signAccessToken"]>(),
    verifyAccessToken: vi.fn<TokenServicePort["verifyAccessToken"]>(),
  };
  const userRepository = {
    findByEmail: vi.fn<UserRepositoryPort["findByEmail"]>(),
    findById: vi.fn<UserRepositoryPort["findById"]>(),
    create: vi.fn<UserRepositoryPort["create"]>(),
  };

  let useCase: AuthenticateAccessTokenUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new AuthenticateAccessTokenUseCase(tokenService, userRepository);
  });

  it("authenticates a token and returns a transportable identity", async () => {
    tokenService.verifyAccessToken.mockReturnValue({
      sub: "user-1",
      email: "reader@example.com",
    });
    userRepository.findById.mockResolvedValue({
      id: "user-1",
      email: "reader@example.com",
      passwordHash: "hash",
      role: "admin",
      permissions: ["media:write"],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    } satisfies User);

    await expect(useCase.execute("valid-token")).resolves.toEqual({
      userId: "user-1",
      email: "reader@example.com",
      role: "admin",
      permissions: ["media:write"],
    });
    expect(tokenService.verifyAccessToken).toHaveBeenCalledWith("valid-token");
    expect(userRepository.findById).toHaveBeenCalledWith("user-1");
  });

  it("rejects an invalid token with a public authentication error", async () => {
    tokenService.verifyAccessToken.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    await expect(useCase.execute("invalid-token")).rejects.toBeInstanceOf(
      AuthUnauthorizedError,
    );
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it("rejects a valid token when its user has been deleted", async () => {
    tokenService.verifyAccessToken.mockReturnValue({
      sub: "deleted-user",
      email: "deleted@example.com",
    });
    userRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute("valid-token")).rejects.toBeInstanceOf(
      AuthUnauthorizedError,
    );
  });
});
