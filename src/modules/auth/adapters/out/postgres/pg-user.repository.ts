import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type {
  CreateUserRecord,
  UserRepositoryPort,
} from "@auth/application/ports/out/user-repository.port.js";
import type { User } from "@auth/domain/entities/user.js";
import { AuthConflictError } from "@auth/domain/errors/auth-errors.js";
import {
  acquirePostgresTransactionLock,
  withPostgresTransaction,
} from "@platform/database/pg-transaction.js";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: User["role"];
  permissions: User["permissions"];
  created_at: Date | string;
  updated_at: Date | string;
}

function mapRow(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    permissions: row.permissions,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class PgUserRepository implements UserRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, role, permissions, created_at, updated_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email],
    );

    return result.rowCount && result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, role, permissions, created_at, updated_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id],
    );

    return result.rowCount && result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async create(input: CreateUserRecord): Promise<User> {
    const id = randomUUID();

    try {
      return await withPostgresTransaction(
        this.pool,
        async (client) => {
          await acquirePostgresTransactionLock(
            client,
            `auth:email:${input.email}`,
          );

          const existing = await client.query<{ id: string }>(
            `SELECT id
             FROM users
             WHERE email = $1
             LIMIT 1`,
            [input.email],
          );
          if ((existing.rowCount ?? 0) > 0) {
            throw new AuthConflictError();
          }

          const result = await client.query<UserRow>(
            `INSERT INTO users (id, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, email, password_hash, role, permissions, created_at, updated_at`,
            [id, input.email, input.passwordHash],
          );

          const row = result.rows[0];
          if (!row) {
            throw new Error("Failed to create user");
          }

          return mapRow(row);
        },
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AuthConflictError();
      }

      throw error;
    }
  }

}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
