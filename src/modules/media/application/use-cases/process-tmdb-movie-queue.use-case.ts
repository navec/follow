import { TmdbHttpError } from "@media/adapters/out/tmdb/tmdb-http.client.js";
import type { SyncResult } from "@media/application/dto/sync-result.dto.js";
import type { ClaimedTmdbMovie } from "@media/application/models/tmdb-catalog-sync.js";
import type { TmdbCatalogSyncRepositoryPort } from "@media/application/ports/out/tmdb-catalog-sync-repository.port.js";

export interface ProcessTmdbMovieQueueOptions {
  batchSize: number;
  leaseSeconds: number;
  requestsPerSecond: number;
  concurrency: number;
  maxAttempts: number;
  retryBaseMs: number;
  retryMaxMs: number;
}

interface ProcessTmdbMovieQueueResult {
  claimed: number;
  completed: number;
  retried: number;
  unavailable: number;
}

type SyncMovie = (tmdbId: number) => Promise<SyncResult>;
type Delay = (delayMs: number) => Promise<void>;
type Jitter = (backoffMs: number) => number;

export class ProcessTmdbMovieQueueUseCase {
  constructor(
    private readonly repository: TmdbCatalogSyncRepositoryPort,
    private readonly syncMovie: SyncMovie,
    private readonly options: ProcessTmdbMovieQueueOptions,
    private readonly clock: () => Date = () => new Date(),
    private readonly delay: Delay = defaultDelay,
    private readonly jitter: Jitter = defaultJitter,
  ) {}

  async execute(): Promise<ProcessTmdbMovieQueueResult> {
    const now = this.clock();
    await this.repository.requeueExpiredLeases(now);
    const claims = await this.repository.claimBatch({
      limit: this.options.batchSize,
      now,
      leaseUntil: new Date(
        now.getTime() + this.options.leaseSeconds * 1000,
      ),
    });
    const result: ProcessTmdbMovieQueueResult = {
      claimed: claims.length,
      completed: 0,
      retried: 0,
      unavailable: 0,
    };
    const waitForStart = this.createStartGate(now);

    await runWithConcurrency(
      claims,
      this.options.concurrency,
      async (claim) => {
        await waitForStart();
        try {
          const syncResult = await this.syncMovie(claim.tmdbId);
          if (syncResult.errors.length > 0) {
            throw new Error(formatSyncErrors(syncResult));
          }

          await this.repository.completeMovie(
            claim.tmdbId,
            claim.claimedAt,
            this.clock(),
          );
          result.completed += 1;
        } catch (error) {
          if (error instanceof TmdbHttpError && error.status === 404) {
            await this.repository.markMovieUnavailable(
              claim.tmdbId,
              error.message,
            );
            result.unavailable += 1;
            return;
          }

          const retryDelayMs = this.computeRetryDelay(claim, error);
          const errorMessage =
            error instanceof Error ? error.message : "Unknown TMDB sync error";
          await this.repository.retryMovie({
            tmdbId: claim.tmdbId,
            error: errorMessage,
            nextAttemptAt: new Date(this.clock().getTime() + retryDelayMs),
            maxAttempts: this.options.maxAttempts,
          });
          result.retried += 1;
        }
      },
    );

    return result;
  }

  private createStartGate(initialNow: Date): () => Promise<void> {
    const intervalMs = Math.ceil(1000 / this.options.requestsPerSecond);
    let nextStartAt = initialNow.getTime();
    let gate = Promise.resolve();

    return () => {
      const permission = gate.then(async () => {
        const waitMs = Math.max(0, nextStartAt - this.clock().getTime());
        if (waitMs > 0) {
          await this.delay(waitMs);
        }
        nextStartAt =
          Math.max(nextStartAt, this.clock().getTime()) + intervalMs;
      });
      gate = permission.catch(() => undefined);
      return permission;
    };
  }

  private computeRetryDelay(
    claim: ClaimedTmdbMovie,
    error: unknown,
  ): number {
    const exponential = Math.min(
      this.options.retryMaxMs,
      this.options.retryBaseMs * 2 ** Math.max(0, claim.attempts - 1),
    );
    const withJitter = Math.min(
      this.options.retryMaxMs,
      exponential + Math.max(0, this.jitter(exponential)),
    );
    const retryAfterMs =
      error instanceof TmdbHttpError ? (error.retryAfterMs ?? 0) : 0;
    return Math.max(withJitter, retryAfterMs);
  }
}

async function runWithConcurrency<TItem>(
  items: ReadonlyArray<TItem>,
  concurrency: number,
  task: (item: TItem) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      if (item !== undefined) {
        await task(item);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
}

function formatSyncErrors(result: SyncResult): string {
  return result.errors
    .map(({ code, message }) => `${code}: ${message}`)
    .join("; ");
}

function defaultDelay(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function defaultJitter(backoffMs: number): number {
  return Math.floor(Math.random() * Math.min(backoffMs / 4, 1000));
}
