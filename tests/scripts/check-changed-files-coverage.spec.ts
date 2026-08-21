import { describe, expect, it } from "vitest";

import { selectCoveredFiles } from "@scripts/check-changed-files-coverage.mjs";

describe("selectCoveredFiles", () => {
  it("selects only production domain and application files inside modules", () => {
    expect(
      selectCoveredFiles([
        "src/modules/auth/domain/entities/user.ts",
        "src/modules/media/application/use-cases/sync-media.use-case.ts",
        "src/modules/auth/domain/entities/user.spec.ts",
        "src/modules/media/adapters/out/tmdb/provider.ts",
        "src/modules/auth/public/auth-api.ts",
        "src/domain/legacy.ts",
      ]),
    ).toEqual([
      "src/modules/auth/domain/entities/user.ts",
      "src/modules/media/application/use-cases/sync-media.use-case.ts",
    ]);
  });
});
