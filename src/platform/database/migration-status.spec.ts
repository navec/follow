import { describe, expect, it } from "vitest";

import { buildMigrationStatuses } from "./migration-status.js";

describe("buildMigrationStatuses", () => {
  it("marks discovered module migrations as applied or pending", () => {
    const statuses = buildMigrationStatuses(
      [
        "/repo/src/modules/auth/adapters/out/postgres/migrations/20260223T160000_create_users.up.js",
        "/repo/src/modules/media/adapters/out/postgres/migrations/20260308T212318_create_media_domain_schema.up.js",
      ],
      ["20260223T160000_create_users.up"],
    );

    expect(statuses).toEqual([
      {
        name: "20260223T160000_create_users.up",
        path: expect.stringContaining("modules/auth"),
        state: "applied",
      },
      {
        name: "20260308T212318_create_media_domain_schema.up",
        path: expect.stringContaining("modules/media"),
        state: "pending",
      },
    ]);
  });
});
