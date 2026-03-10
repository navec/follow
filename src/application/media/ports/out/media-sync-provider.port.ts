import type { SyncRequest, SyncProvider } from "@application/media/dto/sync-request.dto.js";

export interface ProviderWorkAggregate {
  source: {
    provider: SyncProvider;
    sourceValue: string;
  };
  work: {
    type: string;
  };
}

export interface MediaSyncProviderPort {
  supports(provider: SyncProvider): boolean;
  fetch(request: SyncRequest): Promise<ReadonlyArray<ProviderWorkAggregate>>;
}
