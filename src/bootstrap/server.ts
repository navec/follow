import { createServer } from "node:http";

import "dotenv/config";

import cron from "node-cron";

import { createHttpApp } from "@src/entrypoints/http/app.js";
import { flattenEndpoints } from "@src/entrypoints/http/routes/endpoints.js";
import { createAuthModule } from "@src/modules/auth/auth.module.js";
import type { MediaApi } from "@media";
import { loadEnv } from "@platform/config/index.js";
import { createLogger } from "@platform/logging/logger.js";
import { MediaSyncScheduler } from "@infrastructure/scheduling/media-sync.scheduler.js";

import { createContainer } from "./container.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);
  const container = createContainer(env);
  const authApi = createAuthModule({
    userRepository: container.userRepository,
    passwordHasher: container.passwordHasher,
    tokenService: container.tokenService,
  });
  const mediaApi: MediaApi = {
    sync: (command, actor) => container.syncMediaUseCase.execute(command, actor),
  };

  const app = createHttpApp({
    authApi,
    mediaApi,
    logger,
  });

  const scheduler = new MediaSyncScheduler(
    container.syncMediaUseCase,
    env,
    cron.schedule,
  );
  scheduler.start();

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
