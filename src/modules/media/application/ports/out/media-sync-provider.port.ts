import type { NormalizedWorkAggregate } from "../../../domain/models/normalized-work-aggregate.js";
import type { SyncProvider,SyncRequest } from "../../dto/sync-request.dto.js";

export interface MediaSyncProviderPort {
  supports(provider: SyncProvider): boolean;
  fetch(request: SyncRequest): Promise<ReadonlyArray<NormalizedWorkAggregate>>;
}
