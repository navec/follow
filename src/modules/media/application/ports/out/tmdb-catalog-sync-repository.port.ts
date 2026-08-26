import type {
  ClaimedTmdbMovie,
  TmdbInventoryMovie,
} from "@media/application/models/tmdb-catalog-sync.js";

export interface TmdbCatalogSyncRepositoryPort {
  withJobLock<TResult>(
    key: string,
    task: () => Promise<TResult>,
  ): Promise<TResult | undefined>;
  resetInventoryStage(exportDate: string): Promise<void>;
  stageInventoryBatch(
    exportDate: string,
    movies: ReadonlyArray<TmdbInventoryMovie>,
  ): Promise<void>;
  reconcileInventory(
    exportDate: string,
  ): Promise<{ inserted: number; updated: number; missing: number }>;
  getLastCompletedChangesAt(): Promise<Date | undefined>;
  requestRefresh(
    ids: ReadonlyArray<number>,
    requestedAt: Date,
  ): Promise<void>;
  completeChangesWindow(completedAt: Date): Promise<void>;
  requeueExpiredLeases(now: Date): Promise<number>;
  claimBatch(input: {
    limit: number;
    now: Date;
    leaseUntil: Date;
  }): Promise<ReadonlyArray<ClaimedTmdbMovie>>;
  completeMovie(
    tmdbId: number,
    claimedAt: Date,
    completedAt: Date,
  ): Promise<void>;
  retryMovie(input: {
    tmdbId: number;
    claimedAt: Date;
    error: string;
    nextAttemptAt: Date;
    maxAttempts: number;
  }): Promise<void>;
  markMovieUnavailable(
    tmdbId: number,
    claimedAt: Date,
    error: string,
  ): Promise<void>;
}
