import { toPublicUser } from "@domain/auth/entities/user.js";
import { AuthUnauthorizedError } from "@domain/auth/errors/auth-errors.js";

import type { CurrentUserResponseDto } from "../dto/auth-response.dto.js";
import type { UserRepositoryPort } from "../ports/out/user-repository.port.js";

export class GetCurrentUserUseCase {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(input: { userId: string }): Promise<CurrentUserResponseDto> {
    const user = await this.userRepository.findById(input.userId);
    if (!user) {
      throw new AuthUnauthorizedError();
    }

    return { user: toPublicUser(user) };
  }
}
