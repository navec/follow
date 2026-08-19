import { describe, expect, it } from "vitest";

import { createLogger } from "./logger.js";

describe("createLogger", () => {
  it("uses the configured log level", () => {
    expect(
      createLogger({ NODE_ENV: "production", LOG_LEVEL: "fatal" }).level,
    ).toBe("fatal");
  });

  it("defaults to info in production", () => {
    expect(createLogger({ NODE_ENV: "production" }).level).toBe("info");
  });

  it("defaults to debug outside production", () => {
    expect(createLogger({ NODE_ENV: "test" }).level).toBe("debug");
  });
});
