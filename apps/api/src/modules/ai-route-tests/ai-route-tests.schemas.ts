import { z } from "zod";

const textMessageSchema = z.object({
  content: z.string().min(1).max(20000),
  role: z.enum(["assistant", "system", "user"]),
});

export const routeTestParamsSchema = z.object({
  routeId: z.string().uuid(),
});

export const runRouteTestSchema = z.object({
  maxTokens: z.number().int().positive().max(8000).nullable().optional(),
  messages: z.array(textMessageSchema).min(1).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  model: z.string().trim().min(1).max(255).nullable().optional(),
  prompt: z.string().trim().min(1).max(4000).optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
});

export type RouteTestParams = z.infer<typeof routeTestParamsSchema>;
export type RunRouteTestInput = z.infer<typeof runRouteTestSchema>;
