export class AuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class AuthConflictError extends AuthError {
  constructor(message = "Email is already used") {
    super("EMAIL_ALREADY_USED", message);
  }
}

export class AuthPasswordMismatchError extends AuthError {
  constructor(message = "Password and verifyPassword must match") {
    super("PASSWORD_MISMATCH", message);
  }
}

export class AuthInvalidCredentialsError extends AuthError {
  constructor(message = "Invalid email or password") {
    super("INVALID_CREDENTIALS", message);
  }
}

export class AuthUnauthorizedError extends AuthError {
  constructor(message = "Unauthorized") {
    super("UNAUTHORIZED", message);
  }
}
