import type { PublicUser } from "@domain/auth/entities/user.js";

export interface AuthResponseDto {
  user: PublicUser;
  accessToken: string;
}

export interface CurrentUserResponseDto {
  user: PublicUser;
}
