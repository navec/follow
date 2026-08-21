import type { CurrentUserResponseDto } from "@auth/application/dto/auth-response.dto.js";
import type { UserRepositoryPort } from "@auth/application/ports/out/user-repository.port.js";
import { toPublicUser } from "@auth/domain/entities/user.js";
import { AuthUnauthorizedError } from "@auth/domain/errors/auth-errors.js";

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
