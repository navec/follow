import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface RequestLogger {
  info(message: string): void;
}

export function createRequestLoggerMiddleware(
  logger: RequestLogger,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = performance.now();

    res.on("finish", () => {
      const durationMs = Number((performance.now() - startedAt).toFixed(2));
      const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
      const userAgent = req.get("user-agent") ?? "unknown";
      const message = `Method=${req.method} Path=${req.path} Status=${res.statusCode} Duration=${durationMs} IP=${ip} UserAgent=${userAgent}`;
      logger.info(message);
    });

    next();
  };
}
