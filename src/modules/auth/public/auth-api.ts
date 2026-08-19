import type { AuthResponseDto } from "@auth-internal/application/dto/auth-response.dto.js";
import type { LoginInputDto } from "@auth-internal/application/dto/login.dto.js";
import type { RegisterInputDto } from "@auth-internal/application/dto/register.dto.js";

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
