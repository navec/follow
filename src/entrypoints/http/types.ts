import type { Express } from "express";
import type { Logger } from "pino";

import type { AuthApi } from "@auth";
import type { MediaApi } from "@media";

export type CreateHttpApp = (deps: {
  authApi: AuthApi;
  mediaApi?: MediaApi;
  logger: Logger;
}) => Express;
