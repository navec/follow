import type { SyncRequest, SyncProvider } from "@application/media/dto/sync-request.dto.js";
import type { NormalizedWorkAggregate } from "@application/media/models/normalized-work-aggregate.js";

export interface MediaSyncProviderPort {
  supports(provider: SyncProvider): boolean;
  fetch(request: SyncRequest): Promise<ReadonlyArray<NormalizedWorkAggregate>>;
}
