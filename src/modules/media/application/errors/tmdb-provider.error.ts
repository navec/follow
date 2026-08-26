export class TmdbProviderError extends Error {
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(message: string, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = "TmdbProviderError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}
