import type { HttpModuleDefinition } from "../../../../shared/http/contracts/http-module-definition.js";
import type { BodyValidator } from "../../../../shared/http/validation/validator.js";
import type { MediaApi } from "../../public/media-api.js";

import { MediaSyncController } from "./media-sync.controller.js";

interface MediaHttpDependencies {
  api: MediaApi;
  bodyValidator: BodyValidator;
}

export function createMediaHttpDefinition({
  api,
  bodyValidator,
}: MediaHttpDependencies): HttpModuleDefinition {
  const controller = new MediaSyncController({ mediaApi: api, bodyValidator });

  return {
    id: "media",
    basePath: "/media",
    routes: [
      {
        method: "POST",
        path: "/sync",
        access: "authenticated",
        handler: controller.sync,
      },
    ],
  };
}
