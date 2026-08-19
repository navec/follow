import type { ZodType } from "zod";

import type { BodyValidator } from "./validator.js";

export class ZodBodyValidator implements BodyValidator {
  parse<TSchema extends ZodType>(schema: TSchema, input: unknown): ReturnType<TSchema["parse"]> {
    return schema.parse(input);
  }
}
