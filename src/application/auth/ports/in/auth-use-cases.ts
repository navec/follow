import type { AuthResponseDto, CurrentUserResponseDto } from "@application/auth/dto/auth-response.dto.js";
import type { LoginInputDto } from "@application/auth/dto/login.dto.js";
import type { RegisterInputDto } from "@application/auth/dto/register.dto.js";

export interface RegisterUserUseCasePort {
  execute(input: RegisterInputDto): Promise<AuthResponseDto>;
}

export interface LoginUserUseCasePort {
  execute(input: LoginInputDto): Promise<AuthResponseDto>;
}

export interface GetCurrentUserUseCasePort {
  execute(input: { userId: string }): Promise<CurrentUserResponseDto>;
}
