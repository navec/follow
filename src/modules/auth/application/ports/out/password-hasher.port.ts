export interface PasswordHasherPort {
  hash(plainPassword: string): Promise<string>;
  verify(plainPassword: string, passwordHash: string): Promise<boolean>;
}
