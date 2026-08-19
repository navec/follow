export interface RegisterInput {
  email: string;
  password: string;
  verifyPassword: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface PublicUser {
  id: string;
  email: string;
  role: "admin" | "user";
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
}

export interface AuthenticatedIdentity {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface AuthApi {
  register(input: RegisterInput): Promise<AuthResult>;
  login(input: LoginInput): Promise<AuthResult>;
  authenticate(accessToken: string): Promise<AuthenticatedIdentity>;
}
