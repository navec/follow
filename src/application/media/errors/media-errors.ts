export class MediaForbiddenError extends Error {
  readonly code = "FORBIDDEN";

  constructor(message = "Forbidden") {
    super(message);
    this.name = "MediaForbiddenError";
  }
}
