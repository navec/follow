import { describe, expect, it } from "vitest";

import type { User } from "@domain/auth/entities/user.js";
import {
  AuthConflictError,
  AuthPasswordMismatchError,
} from "@domain/auth/errors/auth-errors.js";
import { Email } from "@domain/auth/value-objects/email.js";

import type { PasswordHasherPort } from "../ports/out/password-hasher.port.js";
import type { TokenServicePort } from "../ports/out/token-service.port.js";
import type { UserRepositoryPort } from "../ports/out/user-repository.port.js";

import { RegisterUserUseCase } from "./register-user.use-case.js";

class InMemoryUserRepository implements UserRepositoryPort {
  private readonly users = new Map<string, User>();

  async findByEmail(email: string): Promise<User | null> {
    return this.users.get(email) ?? null;
  }

  async create(input: { email: string; passwordHash: string }): Promise<User> {
    const user: User = {
      id: "user-1",
      email: input.email,
      passwordHash: input.passwordHash,
      createdAt: new Date("2026-02-22T00:00:00.000Z"),
      updatedAt: new Date("2026-02-22T00:00:00.000Z"),
    };
    this.users.set(user.email, user);
    return user;
  }

  async findById(id: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.id === id) {
        return user;
      }
    }
    return null;
  }

  seed(user: User): void {
    this.users.set(user.email, user);
  }
}

class FakePasswordHasher implements PasswordHasherPort {
  async hash(plainPassword: string): Promise<string> {
    return `hash:${plainPassword}`;
  }

  async verify(): Promise<boolean> {
    return true;
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

describe("RegisterUserUseCase", () => {
  it("registers a user and returns an access token", async () => {
    const useCase = new RegisterUserUseCase(
      new InMemoryUserRepository(),
      new FakePasswordHasher(),
      new FakeTokenService(),
    );

    const result = await useCase.execute({
      email: "  USER@example.com ",
      password: "StrongPass123!",
      verifyPassword: "StrongPass123!",
    });

    expect(result.user.id).toBe("user-1");
    expect(result.user.email).toBe(Email.create("user@example.com").value);
    expect(result.accessToken).toBe("token:user-1:user@example.com");
  });

  it("throws conflict when email already exists", async () => {
    const repo = new InMemoryUserRepository();
    repo.seed({
      id: "existing-1",
      email: "user@example.com",
      passwordHash: "hash:x",
      createdAt: new Date("2026-02-22T00:00:00.000Z"),
      updatedAt: new Date("2026-02-22T00:00:00.000Z"),
    });
    const useCase = new RegisterUserUseCase(
      repo,
      new FakePasswordHasher(),
      new FakeTokenService(),
    );

    await expect(
      useCase.execute({
        email: "user@example.com",
        password: "StrongPass123!",
        verifyPassword: "StrongPass123!",
      }),
    ).rejects.toBeInstanceOf(AuthConflictError);
  });

  it("throws when password and verifyPassword do not match", async () => {
    const useCase = new RegisterUserUseCase(
      new InMemoryUserRepository(),
      new FakePasswordHasher(),
      new FakeTokenService(),
    );

    await expect(
      useCase.execute({
        email: "user@example.com",
        password: "StrongPass123!",
        verifyPassword: "DifferentPass123!",
      }),
    ).rejects.toBeInstanceOf(AuthPasswordMismatchError);
  });
});
