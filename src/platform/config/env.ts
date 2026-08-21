import type { AppEnv } from "@platform/config/schema.js";
import { envSchema } from "@platform/config/schema.js";

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): AppEnv => {
  return envSchema.parse(source);
};
