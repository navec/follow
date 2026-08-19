import type { Permission } from "../value-objects/permission.js";
import type { Role } from "../value-objects/role.js";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  role: Role;
}

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, role: user.role };
}
