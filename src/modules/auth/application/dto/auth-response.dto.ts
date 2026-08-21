import type { PublicUser } from "@auth/domain/entities/user.js";

export interface AuthResponseDto {
  user: PublicUser;
  accessToken: string;
}

export interface CurrentUserResponseDto {
  user: PublicUser;
}
