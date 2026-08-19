import type { SyncProvider } from "@media-internal/application/dto/sync-request.dto.js";

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
