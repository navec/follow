import { z } from "zod";

export const mediaSyncSchema = z.union([
  z.object({
    provider: z.enum(["tmdb", "mangadex"]),
    params: z.object({
      target: z.literal("work"),
      externalId: z.union([z.string(), z.number()]),
      type: z.string().min(1)
    })
  }),
  z.object({
    provider: z.enum(["tmdb", "mangadex"]),
    params: z.object({
      target: z.literal("feed"),
      feed: z.string().min(1)
    })
  })
]);
