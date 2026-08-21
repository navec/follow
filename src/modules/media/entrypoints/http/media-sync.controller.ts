import type { NextFunction, Response } from "express";

import { mediaPresenter } from "@media/entrypoints/http/media.presenter.js";
import { mediaSyncSchema } from "@media/entrypoints/http/media-sync.schemas.js";
import type { MediaActor, MediaApi } from "@media/public/media-api.js";
import type { AuthenticatedRequest } from "@shared/http/context/authenticated-request.js";
import type { BodyValidator } from "@shared/http/validation/validator.js";

interface MediaSyncControllerDeps {
  mediaApi: MediaApi;
  bodyValidator: BodyValidator;
}

export class MediaSyncController {
  constructor(private readonly deps: MediaSyncControllerDeps) {}

  sync = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.identity) {
        throw new Error("Missing authenticated user");
      }

      const input = this.deps.bodyValidator.parse(mediaSyncSchema, req.body);
      const actor: MediaActor = {
        id: req.identity.userId,
        role: req.identity.role,
        permissions: [...req.identity.permissions],
      };
      const result = await this.deps.mediaApi.sync(input, actor);
      res.status(202).json(mediaPresenter.sync(result));
    } catch (error) {
      next(error);
    }
  };
}
