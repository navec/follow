import type { SyncResult } from "@application/media/dto/sync-result.dto.js";
import type { NormalizedWorkAggregate } from "@application/media/models/normalized-work-aggregate.js";

export interface MediaSyncRepositoryPort {
  upsertMany(aggregates: ReadonlyArray<NormalizedWorkAggregate>): Promise<SyncResult>;
}
