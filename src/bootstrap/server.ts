import { createServer } from "node:http";

import "dotenv/config";

import { loadEnv } from "@infrastructure/config/index.js";
import { createHttpApp } from "@infrastructure/http/express/app.js";
import { flattenEndpoints } from "@infrastructure/http/express/routes/endpoints.js";
import { createLogger } from "@infrastructure/logging/logger.js";

import { createContainer } from "./container.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);
  const container = createContainer(env);
  const app = createHttpApp({
    registerUserUseCase: container.registerUserUseCase,
    loginUserUseCase: container.loginUserUseCase,
    getCurrentUserUseCase: container.getCurrentUserUseCase,
    tokenService: container.tokenService,
    logger,
  });

  const server = createServer(app);

  server.listen(env.PORT, () => {
    logger.info({}, `API listening port ${env.PORT}`);
    flattenEndpoints().forEach((endpoint) => {
      logger.info(
        {},
        `Method=${endpoint.method} Paht=${endpoint.path} endpoint`,
      );
    });
  });

  const shutdown = async (): Promise<void> => {
    server.close(async () => {
      await container.pgPool.end();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
