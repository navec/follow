import type { SyncResult } from "@application/media/dto/sync-result.dto.js";

import type { ProviderWorkAggregate } from "./media-sync-provider.port.js";

export interface MediaSyncRepositoryPort {
  upsertMany(aggregates: ReadonlyArray<ProviderWorkAggregate>): Promise<SyncResult>;
}
