import { describe, expect, it } from "vitest";

import type { User } from "@domain/auth/entities/user.js";
import { AuthInvalidCredentialsError } from "@domain/auth/errors/auth-errors.js";

import type { PasswordHasherPort } from "../ports/out/password-hasher.port.js";
import type { TokenServicePort } from "../ports/out/token-service.port.js";
import type { UserRepositoryPort } from "../ports/out/user-repository.port.js";

import { LoginUserUseCase } from "./login-user.use-case.js";

class InMemoryUserRepository implements UserRepositoryPort {
  private readonly users = new Map<string, User>();

  async findByEmail(email: string): Promise<User | null> {
    return this.users.get(email) ?? null;
  }

  async findById(): Promise<User | null> {
    return null;
  }

  async create(): Promise<User> {
    throw new Error("not implemented");
  }

  seed(user: User): void {
    this.users.set(user.email, user);
  }
}

class FakePasswordHasher implements PasswordHasherPort {
  async hash(): Promise<string> {
    throw new Error("not implemented");
  }

  async verify(plainPassword: string, passwordHash: string): Promise<boolean> {
    return passwordHash === `hash:${plainPassword}`;
  }
}

class FakeTokenService implements TokenServicePort {
  signAccessToken(payload: { sub: string; email: string }): string {
    return `token:${payload.sub}:${payload.email}`;
  }

  verifyAccessToken(): { sub: string; email: string } {
    throw new Error("not implemented");
  }
}

describe("LoginUserUseCase", () => {
  it("returns token when credentials are valid", async () => {
    const repo = new InMemoryUserRepository();
    repo.seed({
      id: "user-1",
      email: "user@example.com",
      passwordHash: "hash:StrongPass123!",
      createdAt: new Date("2026-02-22T00:00:00.000Z"),
      updatedAt: new Date("2026-02-22T00:00:00.000Z")
    });
    const useCase = new LoginUserUseCase(repo, new FakePasswordHasher(), new FakeTokenService());

    const result = await useCase.execute({
      email: "user@example.com",
      password: "StrongPass123!"
    });

    expect(result.user.id).toBe("user-1");
    expect(result.accessToken).toBe("token:user-1:user@example.com");
  });

  it("throws invalid credentials when password mismatch", async () => {
    const repo = new InMemoryUserRepository();
    repo.seed({
      id: "user-1",
      email: "user@example.com",
      passwordHash: "hash:actual",
      createdAt: new Date("2026-02-22T00:00:00.000Z"),
      updatedAt: new Date("2026-02-22T00:00:00.000Z")
    });
    const useCase = new LoginUserUseCase(repo, new FakePasswordHasher(), new FakeTokenService());

    await expect(
      useCase.execute({ email: "user@example.com", password: "wrong" })
    ).rejects.toBeInstanceOf(AuthInvalidCredentialsError);
  });
});
