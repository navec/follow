export class AuthUnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED";

  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthUnauthorizedError";
  }
}
