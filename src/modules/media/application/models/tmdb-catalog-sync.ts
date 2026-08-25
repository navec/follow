export type TmdbQueueStatus =
  | "pending"
  | "processing"
  | "completed"
  | "retry"
  | "dead";

export interface TmdbInventoryMovie {
  tmdbId: number;
  popularity: number;
}

export interface ClaimedTmdbMovie extends TmdbInventoryMovie {
  attempts: number;
  claimedAt: Date;
}

export interface TmdbChangePage {
  ids: ReadonlyArray<number>;
  page: number;
  totalPages: number;
}
