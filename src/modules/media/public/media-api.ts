import type { SyncRequest } from "@application/media/dto/sync-request.dto.js";
import type { SyncResult } from "@application/media/dto/sync-result.dto.js";
import type { MediaActor } from "@application/media/models/media-actor.js";

export type SyncMediaCommand = SyncRequest;

export interface MediaApi {
  sync(command: SyncMediaCommand, actor: MediaActor): Promise<SyncResult>;
}

export type { MediaActor, SyncResult };
