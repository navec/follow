import type { SyncRequest } from "@application/media/dto/sync-request.dto.js";
import type { SyncResult } from "@application/media/dto/sync-result.dto.js";
import { MediaForbiddenError } from "@application/media/errors/media-errors.js";
import type { MediaActor } from "@application/media/models/media-actor.js";
import type { MediaSyncProviderPort } from "@application/media/ports/out/media-sync-provider.port.js";
import type { MediaSyncRepositoryPort } from "@application/media/ports/out/media-sync-repository.port.js";
import type { MediaAuthorizationPolicy } from "@application/media/services/media-authorization.policy.js";

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
