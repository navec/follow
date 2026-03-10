export interface SyncErrorDto {
  code: string;
  message: string;
  target?: string;
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: ReadonlyArray<SyncErrorDto>;
}
