import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type { User } from "@domain/auth/entities/user.js";
import type { CreateUserRecord, UserRepositoryPort } from "@application/auth/ports/out/user-repository.port.js";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapRow(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export class PgUserRepository implements UserRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, created_at, updated_at
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    return result.rowCount && result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, created_at, updated_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    return result.rowCount && result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async create(input: CreateUserRecord): Promise<User> {
    const id = randomUUID();
    const result = await this.pool.query<UserRow>(
      `INSERT INTO users (id, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, password_hash, created_at, updated_at`,
      [id, input.email, input.passwordHash]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to create user");
    }

    return mapRow(row);
  }
}
