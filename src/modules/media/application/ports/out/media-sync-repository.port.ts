import type { SyncResult } from "@media/application/dto/sync-result.dto.js";
import type { NormalizedWorkAggregate } from "@media/domain/models/normalized-work-aggregate.js";

export interface MediaSyncRepositoryPort {
  upsertMany(aggregates: ReadonlyArray<NormalizedWorkAggregate>): Promise<SyncResult>;
}
