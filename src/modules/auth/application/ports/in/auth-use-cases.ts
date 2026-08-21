import type { AuthResponseDto, CurrentUserResponseDto } from "@auth/application/dto/auth-response.dto.js";
import type { LoginInputDto } from "@auth/application/dto/login.dto.js";
import type { RegisterInputDto } from "@auth/application/dto/register.dto.js";

export interface RegisterUserUseCasePort {
  execute(input: RegisterInputDto): Promise<AuthResponseDto>;
}

export interface LoginUserUseCasePort {
  execute(input: LoginInputDto): Promise<AuthResponseDto>;
}

export interface GetCurrentUserUseCasePort {
  execute(input: { userId: string }): Promise<CurrentUserResponseDto>;
}
