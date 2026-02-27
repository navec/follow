import { createServer } from "node:http";

import "dotenv/config";

import { loadEnv } from "@infrastructure/config/index.js";
import { createHttpApp } from "@infrastructure/http/express/app.js";

import { createContainer } from "./container.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const container = createContainer(env);
  const app = createHttpApp({
    registerUserUseCase: container.registerUserUseCase,
    loginUserUseCase: container.loginUserUseCase,
    getCurrentUserUseCase: container.getCurrentUserUseCase,
    tokenService: container.tokenService,
  });

  const server = createServer(app);
  server.listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
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
