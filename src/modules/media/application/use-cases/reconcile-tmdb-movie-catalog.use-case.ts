import type { TmdbInventoryMovie } from "@media/application/models/tmdb-catalog-sync.js";
import type { TmdbCatalogSourcePort } from "@media/application/ports/out/tmdb-catalog-source.port.js";
import type { TmdbCatalogSyncRepositoryPort } from "@media/application/ports/out/tmdb-catalog-sync-repository.port.js";

type ReconcileTmdbMovieCatalogResult =
  | {
      status: "completed";
      inserted: number;
      updated: number;
      missing: number;
    }
  | { status: "skipped" };

export class ReconcileTmdbMovieCatalogUseCase {
  constructor(
    private readonly source: TmdbCatalogSourcePort,
    private readonly repository: TmdbCatalogSyncRepositoryPort,
    private readonly batchSize = 1000,
  ) {}

  async execute(exportDate: string): Promise<ReconcileTmdbMovieCatalogResult> {
    const reconciliation = await this.repository.withJobLock(
      "tmdb-catalog-inventory",
      async () => {
        await this.repository.resetInventoryStage(exportDate);
        let batch: TmdbInventoryMovie[] = [];

        for await (const movie of this.source.streamMovieInventory(exportDate)) {
          batch.push(movie);
          if (batch.length === this.batchSize) {
            await this.repository.stageInventoryBatch(exportDate, batch);
            batch = [];
          }
        }

        if (batch.length > 0) {
          await this.repository.stageInventoryBatch(exportDate, batch);
        }

        return this.repository.reconcileInventory(exportDate);
      },
    );

    if (!reconciliation) {
      return { status: "skipped" };
    }

    return { status: "completed", ...reconciliation };
  }
}
