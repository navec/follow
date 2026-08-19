import type { PasswordHasherPort } from "./application/ports/out/password-hasher.port.js";
import type { TokenServicePort } from "./application/ports/out/token-service.port.js";
import type { UserRepositoryPort } from "./application/ports/out/user-repository.port.js";
import { AuthenticateAccessTokenUseCase } from "./application/use-cases/authenticate-access-token.use-case.js";
import { LoginUserUseCase } from "./application/use-cases/login-user.use-case.js";
import { RegisterUserUseCase } from "./application/use-cases/register-user.use-case.js";
import type { AuthApi } from "./public/auth-api.js";

interface AuthModuleDependencies {
  userRepository: UserRepositoryPort;
  passwordHasher: PasswordHasherPort;
  tokenService: TokenServicePort;
}

export function createAuthModule({
  userRepository,
  passwordHasher,
  tokenService,
}: AuthModuleDependencies): AuthApi {
  const registerUser = new RegisterUserUseCase(
    userRepository,
    passwordHasher,
    tokenService,
  );
  const loginUser = new LoginUserUseCase(
    userRepository,
    passwordHasher,
    tokenService,
  );
  const authenticateAccessToken = new AuthenticateAccessTokenUseCase(
    tokenService,
    userRepository,
  );

  return {
    register: (input) => registerUser.execute(input),
    login: (input) => loginUser.execute(input),
    authenticate: (accessToken) => authenticateAccessToken.execute(accessToken),
  };
}
