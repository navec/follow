import type { TokenServicePort } from "@auth/application/ports/out/token-service.port.js";
import type { UserRepositoryPort } from "@auth/application/ports/out/user-repository.port.js";
import { AuthUnauthorizedError } from "@auth/domain/errors/auth-errors.js";

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
