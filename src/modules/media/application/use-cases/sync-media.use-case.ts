import { MediaForbiddenError } from "@media";
import type { SyncRequest } from "@media-internal/application/dto/sync-request.dto.js";
import type { SyncResult } from "@media-internal/application/dto/sync-result.dto.js";
import type { MediaActor } from "@media-internal/application/models/media-actor.js";
import type { MediaSyncProviderPort } from "@media-internal/application/ports/out/media-sync-provider.port.js";
import type { MediaSyncRepositoryPort } from "@media-internal/application/ports/out/media-sync-repository.port.js";
import type { MediaAuthorizationPolicy } from "@media-internal/application/services/media-authorization.policy.js";

export class SyncMediaUseCase {
  constructor(
    private readonly providers: ReadonlyArray<MediaSyncProviderPort>,
    private readonly repository: MediaSyncRepositoryPort,
    private readonly authorizationPolicy: MediaAuthorizationPolicy
  ) {}

  async execute(request: SyncRequest, actor: MediaActor): Promise<SyncResult> {
    if (!this.authorizationPolicy.canSync(actor)) {
      throw new MediaForbiddenError();
    }

    const provider = this.providers.find(({ supports }) => supports(request.provider));
    if (!provider) {
      throw new Error(`No media sync provider registered for ${request.provider}`);
    }

    const aggregates = await provider.fetch(request);
    return this.repository.upsertMany(aggregates);
  }
}
