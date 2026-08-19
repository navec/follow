import type { Express } from "express";
import type { Logger } from "pino";

import type { AuthApi } from "@auth";
import type { MediaApi } from "@media";

import type { HttpModuleDefinition } from "../../shared/http/contracts/http-module-definition.js";

export type CreateHttpApp = (deps: {
  auth: { api: AuthApi; http: HttpModuleDefinition };
  media?: { api: MediaApi; http: HttpModuleDefinition };
  logger: Logger;
}) => Express;
