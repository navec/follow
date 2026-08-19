import type { SyncResult } from "@media-internal/application/dto/sync-result.dto.js";
import type { NormalizedWorkAggregate } from "@media-internal/domain/models/normalized-work-aggregate.js";

export interface MediaSyncRepositoryPort {
  upsertMany(aggregates: ReadonlyArray<NormalizedWorkAggregate>): Promise<SyncResult>;
}
