import { z } from "zod";

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
