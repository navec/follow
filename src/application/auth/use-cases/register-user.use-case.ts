import { toPublicUser } from "@domain/auth/entities/user.js";
import { AuthConflictError } from "@domain/auth/errors/auth-errors.js";
import { Email } from "@domain/auth/value-objects/email.js";

import type { AuthResponseDto } from "../dto/auth-response.dto.js";
import type { RegisterInputDto } from "../dto/register.dto.js";
import type { PasswordHasherPort } from "../ports/out/password-hasher.port.js";
import type { TokenServicePort } from "../ports/out/token-service.port.js";
import type { UserRepositoryPort } from "../ports/out/user-repository.port.js";

export class RegisterUserUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly tokenService: TokenServicePort,
  ) {}

  async execute(input: RegisterInputDto): Promise<AuthResponseDto> {
    const email = Email.create(input.email).value;
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new AuthConflictError();
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.userRepository.create({ email, passwordHash });
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
    });

    return {
      user: toPublicUser(user),
      accessToken,
    };
  }
}
