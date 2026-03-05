import pino, { type Logger, type LoggerOptions } from "pino";

import type { AppEnv } from "@infrastructure/config/index.js";

export function createLogger(env: Pick<AppEnv, "NODE_ENV">): Logger {
  const options: LoggerOptions = {
    level: env.NODE_ENV === "production" ? "info" : "debug"
  };

  if (env.NODE_ENV !== "production") {
    options.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname"
      }
    };
  }

  return pino(options);
}
