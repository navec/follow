export interface BodyValidator {
  parse<T>(schema: { parse(input: unknown): T }, input: unknown): T;
}
