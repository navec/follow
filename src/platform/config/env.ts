import type { AppEnv } from "./schema.js";
import { envSchema } from "./schema.js";

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): AppEnv => {
  return envSchema.parse(source);
};
