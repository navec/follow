import type { AuthResponseDto } from "@application/auth/dto/auth-response.dto.js";
import type { LoginInputDto } from "@application/auth/dto/login.dto.js";
import type { RegisterInputDto } from "@application/auth/dto/register.dto.js";

export type AuthResult = AuthResponseDto;

export interface AuthenticatedIdentity {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface AuthApi {
  register(input: RegisterInputDto): Promise<AuthResult>;
  login(input: LoginInputDto): Promise<AuthResult>;
  authenticate(accessToken: string): Promise<AuthenticatedIdentity>;
}
