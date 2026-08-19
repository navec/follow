const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(public readonly value: string) {}

  static create(raw: string): Email {
    const normalized = raw.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(normalized)) {
      throw new Error("Invalid email");
    }

    return new Email(normalized);
  }
}
