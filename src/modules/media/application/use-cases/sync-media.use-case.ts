import type { SyncRequest } from "@media/application/dto/sync-request.dto.js";
import type { SyncResult } from "@media/application/dto/sync-result.dto.js";
import type { MediaActor } from "@media/application/models/media-actor.js";
import type { MediaSyncProviderPort } from "@media/application/ports/out/media-sync-provider.port.js";
import type { MediaSyncRepositoryPort } from "@media/application/ports/out/media-sync-repository.port.js";
import type { MediaAuthorizationPolicy } from "@media/application/services/media-authorization.policy.js";
import { MediaForbiddenError } from "@media/public/index.js";

export class SyncMediaUseCase {
  constructor(
    private readonly providers: ReadonlyArray<MediaSyncProviderPort>,
    private readonly repository: MediaSyncRepositoryPort,
    private readonly authorizationPolicy: MediaAuthorizationPolicy,
  ) {}

  async execute(request: SyncRequest, actor: MediaActor): Promise<SyncResult> {
    if (!this.authorizationPolicy.canSync(actor)) {
      throw new MediaForbiddenError();
    }

    const provider = this.providers.find(({ supports }) =>
      supports(request.provider),
    );
    if (!provider) {
      throw new Error(
        `No media sync provider registered for ${request.provider}`,
      );
    }

    const aggregates = await provider.fetch(request);
    return this.repository.upsertMany(aggregates);
  }
}
