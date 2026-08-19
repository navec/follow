import { createServer } from "node:http";

import "dotenv/config";

import cron from "node-cron";

import { loadEnv } from "@platform/config/index.js";
import { flattenEndpoints } from "@entrypoints/http/routes/endpoints.js";

import { createContainer } from "./container.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const container = createContainer(env);
  container.media.scheduledJobs.forEach((job) => {
    cron.schedule(job.expression, job.handler);
  });

  const server = createServer(container.app);

  server.listen(env.PORT, () => {
    container.logger.info({}, `API listening port ${env.PORT}`);
    flattenEndpoints().forEach((endpoint) => {
      container.logger.info(
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
