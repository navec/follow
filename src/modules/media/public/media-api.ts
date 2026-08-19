import type { SyncRequest } from "@media-internal/application/dto/sync-request.dto.js";
import type { SyncResult } from "@media-internal/application/dto/sync-result.dto.js";
import type { MediaActor } from "@media-internal/application/models/media-actor.js";

export type SyncMediaCommand = SyncRequest;

export interface MediaApi {
  sync(command: SyncMediaCommand, actor: MediaActor): Promise<SyncResult>;
}

export type { MediaActor, SyncResult };
