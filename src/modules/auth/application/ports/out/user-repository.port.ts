import type { User } from "@auth-internal/domain/entities/user.js";

export interface CreateUserRecord {
  email: string;
  passwordHash: string;
}

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserRecord): Promise<User>;
}
