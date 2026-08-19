import { describe, expect, it } from "vitest";

import { JwtTokenService } from "./jwt-token-service.js";

describe("JwtTokenService", () => {
  it("signs and verifies an access token when payload contains sub", () => {
    const service = new JwtTokenService({
      secret: "test-secret",
      expiresIn: "1h",
    });

    const payload = { sub: "user-123", email: "user@example.com" };

    const token = service.signAccessToken(payload);

    expect(typeof token).toBe("string");
    expect(service.verifyAccessToken(token)).toEqual(payload);
  });
});
