import type { User } from "@domain/auth/entities/user.js";

export interface CreateUserRecord {
  email: string;
  passwordHash: string;
}

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserRecord): Promise<User>;
}
