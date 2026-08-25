import type { TmdbCatalogSourcePort } from "@media/application/ports/out/tmdb-catalog-source.port.js";
import type { TmdbCatalogSyncRepositoryPort } from "@media/application/ports/out/tmdb-catalog-sync-repository.port.js";

type DiscoverTmdbMovieChangesResult =
  | {
      status: "completed";
      pages: number;
      requested: number;
      completedAt: Date;
    }
  | { status: "skipped" };

export class DiscoverTmdbMovieChangesUseCase {
  constructor(
    private readonly source: TmdbCatalogSourcePort,
    private readonly repository: TmdbCatalogSyncRepositoryPort,
    private readonly clock: () => Date,
    private readonly batchSize = 1000,
  ) {}

  async execute(): Promise<DiscoverTmdbMovieChangesResult> {
    const discovery = await this.repository.withJobLock(
      "tmdb-catalog-changes",
      async () => {
        const requestedAt = this.clock();
        const today = startOfUtcDay(requestedAt);
        const lastCompleted =
          await this.repository.getLastCompletedChangesAt();
        const start = addUtcDays(
          startOfUtcDay(lastCompleted ?? requestedAt),
          -1,
        );
        const maximumEnd = addUtcDays(start, 13);
        const end = maximumEnd < today ? maximumEnd : today;
        const startDate = formatUtcDate(start);
        const endDate = formatUtcDate(end);

        const seen = new Set<number>();
        let batch: number[] = [];
        let page = 1;
        let totalPages = 1;
        let pages = 0;

        do {
          const changes = await this.source.getChangedMovieIds({
            startDate,
            endDate,
            page,
          });
          totalPages = changes.totalPages;
          pages += 1;

          for (const id of changes.ids) {
            if (seen.has(id)) {
              continue;
            }
            seen.add(id);
            batch.push(id);
            if (batch.length === this.batchSize) {
              await this.repository.requestRefresh(batch, requestedAt);
              batch = [];
            }
          }
          page += 1;
        } while (page <= totalPages);

        if (batch.length > 0) {
          await this.repository.requestRefresh(batch, requestedAt);
        }

        const completedAt =
          end.getTime() === today.getTime()
            ? requestedAt
            : endOfUtcDay(end);
        await this.repository.completeChangesWindow(completedAt);
        return {
          pages,
          requested: seen.size,
          completedAt,
        };
      },
    );

    if (!discovery) {
      return { status: "skipped" };
    }

    return { status: "completed", ...discovery };
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function endOfUtcDay(date: Date): Date {
  const end = addUtcDays(date, 1);
  return new Date(end.getTime() - 1);
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
