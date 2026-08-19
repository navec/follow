import type { NormalizedWorkAggregate } from "../../../domain/models/normalized-work-aggregate.js";
import type { SyncResult } from "../../dto/sync-result.dto.js";

export interface MediaSyncRepositoryPort {
  upsertMany(aggregates: ReadonlyArray<NormalizedWorkAggregate>): Promise<SyncResult>;
}
