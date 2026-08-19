import { AuthUnauthorizedError } from "@domain/auth/errors/auth-errors.js";

import type { TokenServicePort } from "../ports/out/token-service.port.js";
import type { UserRepositoryPort } from "../ports/out/user-repository.port.js";

export class AuthenticateAccessTokenUseCase {
  constructor(
    private readonly tokenService: TokenServicePort,
    private readonly userRepository: UserRepositoryPort,
  ) {}

  async execute(accessToken: string) {
    let payload: ReturnType<TokenServicePort["verifyAccessToken"]>;

    try {
      payload = this.tokenService.verifyAccessToken(accessToken);
    } catch {
      throw new AuthUnauthorizedError();
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new AuthUnauthorizedError();
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      permissions: [...user.permissions],
    };
  }
}
