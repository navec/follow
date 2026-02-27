import { describe, expect, it } from "vitest";

import type { User } from "@domain/auth/entities/user.js";
import { AuthUnauthorizedError } from "@domain/auth/errors/auth-errors.js";

import type { UserRepositoryPort } from "../ports/out/user-repository.port.js";

import { GetCurrentUserUseCase } from "./get-current-user.use-case.js";

class InMemoryUserRepository implements UserRepositoryPort {
  private readonly users = new Map<string, User>();

  async findByEmail(): Promise<User | null> {
    return null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async create(): Promise<User> {
    throw new Error("not implemented");
  }

  seed(user: User): void {
    this.users.set(user.id, user);
  }
}

describe("GetCurrentUserUseCase", () => {
  it("throws an authentication error when the user cannot be found", async () => {
    const useCase = new GetCurrentUserUseCase(new InMemoryUserRepository());
    await expect(
      useCase.execute({ userId: "fake_user_id" }),
    ).rejects.toBeInstanceOf(AuthUnauthorizedError);
  });

  it("returns ", async () => {
    const repo = new InMemoryUserRepository();
    repo.seed({
      id: "fake_user_id",
      email: "user@example.com",
      passwordHash: "hash:actual",
      createdAt: new Date("2026-02-22T00:00:00.000Z"),
      updatedAt: new Date("2026-02-22T00:00:00.000Z"),
    });

    const useCase = new GetCurrentUserUseCase(repo);

    const result = await useCase.execute({ userId: "fake_user_id" });

    expect(result.user.id).toBe("fake_user_id");
    expect(result).toEqual({
      user: {
        email: "user@example.com",
        id: "fake_user_id",
      },
    });
  });
});
