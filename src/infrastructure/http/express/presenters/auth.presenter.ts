import type { AuthResponseDto, CurrentUserResponseDto } from "@application/auth/dto/auth-response.dto.js";

export const authPresenter = {
  auth(data: AuthResponseDto) {
    return { data };
  },
  me(data: CurrentUserResponseDto) {
    return { data };
  }
};
