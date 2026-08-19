import { describe, expect, it } from "vitest";

import { MediaAuthorizationPolicy } from "./media-authorization.policy.js";

describe("MediaAuthorizationPolicy", () => {
  const policy = new MediaAuthorizationPolicy();

  it("allows only admins with media:write", () => {
    expect(
      policy.canSync({
        id: "admin-1",
        role: "admin",
        permissions: ["media:write"],
      }),
    ).toBe(true);

    expect(
      policy.canSync({
        id: "user-1",
        role: "user",
        permissions: ["media:write"],
      }),
    ).toBe(false);
  });
});
