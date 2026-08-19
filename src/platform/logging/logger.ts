import pino, { type Logger, type LoggerOptions } from "pino";

import type { AppEnv } from "@platform/config/index.js";

export function createLogger(
  env: Pick<AppEnv, "NODE_ENV" | "LOG_LEVEL">,
): Logger {
  const options: LoggerOptions = {
    level:
      env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug"),
  };

  if (env.NODE_ENV !== "production") {
    options.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    };
  }

  return pino(options);
}
