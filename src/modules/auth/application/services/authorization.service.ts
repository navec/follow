import type { User } from "@auth-internal/domain/entities/user.js";

export class AuthorizationService {
  canWriteMedia(user: User): boolean {
    return user.role === "admin" && user.permissions.includes("media:write");
  }
}
