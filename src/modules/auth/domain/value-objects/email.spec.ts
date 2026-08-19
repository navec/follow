import { describe, expect, it } from "vitest";

import { Email } from "./email.js";

describe("Email", () => {
  it("normalizes and stores a valid email", () => {
    const email = Email.create("  USER@Example.com ");

    expect(email.value).toBe("user@example.com");
  });

  it("throws for invalid email", () => {
    expect(() => Email.create("not-an-email")).toThrowError(/invalid email/i);
  });
});
