import type { SyncProvider } from "@application/media/dto/sync-request.dto.js";

export interface NormalizedWorkAggregate {
  source: {
    provider: SyncProvider;
    sourceValue: string;
  };
  work: {
    type: string;
    releaseDate?: string;
  };
}
