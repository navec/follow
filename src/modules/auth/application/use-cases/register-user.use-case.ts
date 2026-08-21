import type { AuthResponseDto } from "@auth/application/dto/auth-response.dto.js";
import type { RegisterInputDto } from "@auth/application/dto/register.dto.js";
import type { PasswordHasherPort } from "@auth/application/ports/out/password-hasher.port.js";
import type { TokenServicePort } from "@auth/application/ports/out/token-service.port.js";
import type { UserRepositoryPort } from "@auth/application/ports/out/user-repository.port.js";
import { toPublicUser } from "@auth/domain/entities/user.js";
import {
  AuthConflictError,
  AuthPasswordMismatchError,
} from "@auth/domain/errors/auth-errors.js";
import { Email } from "@auth/domain/value-objects/email.js";

export class RegisterUserUseCase {
  private static readonly emailLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly tokenService: TokenServicePort,
  ) {}

  async execute(input: RegisterInputDto): Promise<AuthResponseDto> {
    if (input.password !== input.verifyPassword) {
      throw new AuthPasswordMismatchError();
    }

    const email = Email.create(input.email).value;

    return this.withEmailLock(email, async () => {
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
    });
  }

  private async withEmailLock<T>(
    email: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = RegisterUserUseCase.emailLocks.get(email);
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    RegisterUserUseCase.emailLocks.set(email, current);

    try {
      await previous;
      return await operation();
    } finally {
      release?.();
      if (RegisterUserUseCase.emailLocks.get(email) === current) {
        RegisterUserUseCase.emailLocks.delete(email);
      }
    }
  }
}
