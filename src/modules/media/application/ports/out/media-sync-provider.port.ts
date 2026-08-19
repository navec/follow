import type { SyncProvider,SyncRequest } from "@media-internal/application/dto/sync-request.dto.js";
import type { NormalizedWorkAggregate } from "@media-internal/domain/models/normalized-work-aggregate.js";

export interface MediaSyncProviderPort {
  supports(provider: SyncProvider): boolean;
  fetch(request: SyncRequest): Promise<ReadonlyArray<NormalizedWorkAggregate>>;
}
