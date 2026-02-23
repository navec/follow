import { toPublicUser } from "@domain/auth/entities/user.js";
import { AuthInvalidCredentialsError } from "@domain/auth/errors/auth-errors.js";
import { Email } from "@domain/auth/value-objects/email.js";

import type { AuthResponseDto } from "../dto/auth-response.dto.js";
import type { LoginInputDto } from "../dto/login.dto.js";
import type { PasswordHasherPort } from "../ports/out/password-hasher.port.js";
import type { TokenServicePort } from "../ports/out/token-service.port.js";
import type { UserRepositoryPort } from "../ports/out/user-repository.port.js";

export class LoginUserUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly tokenService: TokenServicePort
  ) {}

  async execute(input: LoginInputDto): Promise<AuthResponseDto> {
    const email = Email.create(input.email).value;
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new AuthInvalidCredentialsError();
    }

    const matches = await this.passwordHasher.verify(input.password, user.passwordHash);
    if (!matches) {
      throw new AuthInvalidCredentialsError();
    }

    const accessToken = this.tokenService.signAccessToken({ sub: user.id, email: user.email });

    return {
      user: toPublicUser(user),
      accessToken
    };
  }
}
