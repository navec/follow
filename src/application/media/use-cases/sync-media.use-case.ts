import { AuthUnauthorizedError } from "@domain/auth/errors/auth-errors.js";
import type { User } from "@domain/auth/entities/user.js";
import { AuthorizationService } from "@application/auth/services/authorization.service.js";
import type { SyncRequest } from "@application/media/dto/sync-request.dto.js";
import type { SyncResult } from "@application/media/dto/sync-result.dto.js";
import type { MediaSyncProviderPort } from "@application/media/ports/out/media-sync-provider.port.js";
import type { MediaSyncRepositoryPort } from "@application/media/ports/out/media-sync-repository.port.js";

export class SyncMediaUseCase {
  constructor(
    private readonly providers: ReadonlyArray<MediaSyncProviderPort>,
    private readonly repository: MediaSyncRepositoryPort,
    private readonly authorizationService: AuthorizationService
  ) {}

  async execute(request: SyncRequest, actor: User): Promise<SyncResult> {
    if (!this.authorizationService.canWriteMedia(actor)) {
      throw new AuthUnauthorizedError();
    }

    const provider = this.providers.find(({ supports }) => supports(request.provider));
    if (!provider) {
      throw new Error(`No media sync provider registered for ${request.provider}`);
    }

    const aggregates = await provider.fetch(request);
    return this.repository.upsertMany(aggregates);
  }
}
