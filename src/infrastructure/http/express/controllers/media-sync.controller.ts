import type { NextFunction, Request, Response } from "express";

import type { User } from "@auth-internal/domain/entities/user.js";
import type { SyncRequest } from "@application/media/dto/sync-request.dto.js";
import type { SyncResult } from "@application/media/dto/sync-result.dto.js";

import { mediaSyncSchema } from "../validation/schemas/media-sync.schemas.js";
import type { BodyValidator } from "../validation/validator.js";

type AuthenticatedRequest = Request & { user?: User };

interface SyncMediaUseCasePort {
  execute(request: SyncRequest, actor: User): Promise<SyncResult>;
}

interface MediaSyncControllerDeps {
  syncMediaUseCase: SyncMediaUseCasePort;
  bodyValidator: BodyValidator;
}

export class MediaSyncController {
  constructor(private readonly deps: MediaSyncControllerDeps) {}

  sync = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new Error("Missing authenticated user");
      }

      const input = this.deps.bodyValidator.parse(mediaSyncSchema, req.body);
      const result = await this.deps.syncMediaUseCase.execute(input, req.user);
      res.status(202).json({ data: result });
    } catch (error) {
      next(error);
    }
  };
}
