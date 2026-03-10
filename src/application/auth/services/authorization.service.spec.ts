import { describe, expect, it } from "vitest";

import type { User } from "@domain/auth/entities/user.js";

import { AuthorizationService } from "./authorization.service.js";

describe("AuthorizationService", () => {
  const service = new AuthorizationService();

  it("allows media sync for admin users with media:write", () => {
    const user: User = {
      id: "user-1",
      email: "admin@example.com",
      passwordHash: "hash",
      role: "admin",
      permissions: ["media:write"],
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      updatedAt: new Date("2026-03-10T00:00:00.000Z")
    };

    expect(service.canWriteMedia(user)).toBe(true);
  });

  it("rejects media sync when permission is missing", () => {
    const user: User = {
      id: "user-2",
      email: "admin-no-permission@example.com",
      passwordHash: "hash",
      role: "admin",
      permissions: [],
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      updatedAt: new Date("2026-03-10T00:00:00.000Z")
    };

    expect(service.canWriteMedia(user)).toBe(false);
  });
});
