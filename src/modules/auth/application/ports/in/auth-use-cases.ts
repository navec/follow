import type { AuthResponseDto, CurrentUserResponseDto } from "../../dto/auth-response.dto.js";
import type { LoginInputDto } from "../../dto/login.dto.js";
import type { RegisterInputDto } from "../../dto/register.dto.js";

export interface RegisterUserUseCasePort {
  execute(input: RegisterInputDto): Promise<AuthResponseDto>;
}

export interface LoginUserUseCasePort {
  execute(input: LoginInputDto): Promise<AuthResponseDto>;
}

export interface GetCurrentUserUseCasePort {
  execute(input: { userId: string }): Promise<CurrentUserResponseDto>;
}
