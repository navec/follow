import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createRequestLoggerMiddleware, type RequestLogger } from "./request-logger.js";

describe("createRequestLoggerMiddleware", () => {
  it("logs method, path, status, duration, ip and user-agent", async () => {
    const logger: RequestLogger = {
      info: vi.fn()
    };

    const middleware = createRequestLoggerMiddleware(logger);
    const req = {
      method: "GET",
      path: "/health",
      ip: "203.0.113.99",
      socket: { remoteAddress: null },
      get: vi.fn().mockReturnValue("vitest-agent/1.0")
    };
    const res = new EventEmitter() as EventEmitter & { statusCode: number };
    res.statusCode = 200;
    const next = vi.fn();

    middleware(req as never, res as never, next);
    res.emit("finish");

    expect(next).toHaveBeenCalledOnce();

    expect(logger.info).toHaveBeenCalledTimes(1);
    const call = vi.mocked(logger.info).mock.calls[0];

    expect(call).toBeDefined();
    if (!call) {
      return;
    }

    const [message] = call;

    expect(message).toContain("Method=GET");
    expect(message).toContain("Path=/health");
    expect(message).toContain("Status=200");
    expect(message).toContain("IP=203.0.113.99");
    expect(message).toContain("UserAgent=vitest-agent/1.0");
    expect(message).toMatch(/Duration=\d+(\.\d+)?/);
  });
});
