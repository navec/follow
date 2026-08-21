import { MediaSyncController } from "@media/entrypoints/http/media-sync.controller.js";
import type { MediaApi } from "@media/public/media-api.js";
import type { HttpModuleDefinition } from "@shared/http/contracts/http-module-definition.js";
import type { BodyValidator } from "@shared/http/validation/validator.js";

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
