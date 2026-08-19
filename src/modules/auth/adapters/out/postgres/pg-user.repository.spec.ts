import { describe, expect, it, vi } from "vitest";

import { AuthConflictError } from "../../../domain/errors/auth-errors.js";

import { PgUserRepository } from "./pg-user.repository.js";

describe("PgUserRepository", () => {
  it("maps duplicate email violations to AuthConflictError", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockRejectedValueOnce({ code: "23505" })
        .mockResolvedValueOnce(undefined),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    };
    const repository = new PgUserRepository(pool as never);

    await expect(
      repository.create({
        email: "race@example.com",
        passwordHash: "hashed-password",
      }),
    ).rejects.toBeInstanceOf(AuthConflictError);

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });

  it("rejects duplicate emails found under the advisory lock", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "existing-user-id" }] })
        .mockResolvedValueOnce(undefined),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    };
    const repository = new PgUserRepository(pool as never);

    await expect(
      repository.create({
        email: "race@example.com",
        passwordHash: "hashed-password",
      }),
    ).rejects.toBeInstanceOf(AuthConflictError);

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });
});
