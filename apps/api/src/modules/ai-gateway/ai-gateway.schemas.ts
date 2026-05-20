import { z } from "zod";

const jsonRecordSchema = z.record(z.string(), z.unknown());
const routeStatusSchema = z.enum(["active", "inactive"]);

function normalizeHttpUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("baseUrlOverride must use http or https");
  }
  return url.toString();
}

export const routeIdParamsSchema = z.object({
  routeId: z.string().uuid(),
});

export const credentialIdParamsSchema = z.object({
  credentialId: z.string().uuid(),
});

export const createProviderSchema = z.object({
  capabilities: jsonRecordSchema.optional(),
  defaultBaseUrl: z.string().trim().url().nullable().optional(),
  key: z.string().trim().min(1).max(100),
  kind: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(255),
  status: z.string().trim().min(1).max(50).optional(),
});

export const createModelSchema = z.object({
  capabilities: jsonRecordSchema.optional(),
  contextWindow: z.number().int().positive().nullable().optional(),
  displayName: z.string().trim().min(1).max(255),
  modality: z.string().trim().min(1).max(100),
  modelKey: z.string().trim().min(1).max(255),
  providerId: z.string().uuid(),
  status: z.string().trim().min(1).max(50).optional(),
});

export const createRouteSchema = z.object({
  baseUrlOverride: z.string().trim().url().transform(normalizeHttpUrl).nullable().optional(),
  credentialId: z.string().uuid().nullable().optional(),
  fallbackGroup: z.string().trim().min(1).max(255).nullable().optional(),
  modality: z.string().trim().min(1).max(100),
  modelId: z.string().uuid().nullable().optional(),
  pricing: jsonRecordSchema.optional(),
  priority: z.number().int().min(0).optional(),
  providerId: z.string().uuid(),
  rateLimit: jsonRecordSchema.optional(),
  requestConfig: jsonRecordSchema.optional(),
  routeKey: z.string().trim().min(1).max(255),
  status: routeStatusSchema.optional(),
  weight: z.number().int().min(0).optional(),
});

export const updateRouteSchema = z
  .object({
    baseUrlOverride: z.string().trim().url().transform(normalizeHttpUrl).nullable().optional(),
    credentialId: z.string().uuid().nullable().optional(),
    fallbackGroup: z.string().trim().min(1).max(255).nullable().optional(),
    modelId: z.string().uuid().nullable().optional(),
    pricing: jsonRecordSchema.optional(),
    priority: z.number().int().min(0).optional(),
    rateLimit: jsonRecordSchema.optional(),
    requestConfig: jsonRecordSchema.optional(),
    status: routeStatusSchema.optional(),
    weight: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one route field must be provided",
  });

export const createCredentialSchema = z.object({
  name: z.string().trim().min(1).max(255),
  providerId: z.string().uuid(),
  secret: z.string().trim().min(1).max(4000),
  status: z.string().trim().min(1).max(50).optional(),
});

export const updateCredentialSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    status: z.string().trim().min(1).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one credential field must be provided",
  });

export const rotateCredentialSchema = z.object({
  secret: z.string().trim().min(1).max(4000),
});

export const textMessageSchema = z.object({
  content: z.string().min(1).max(20000),
  role: z.enum(["assistant", "system", "user"]),
});

export const generateTextSchema = z.object({
  maxTokens: z.number().int().positive().nullable().optional(),
  messages: z.array(textMessageSchema).min(1),
  model: z.string().trim().min(1).max(255).nullable().optional(),
  routeKey: z.string().trim().min(1).max(255).nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
});

export const listRuntimeRoutesQuerySchema = z.object({
  modality: z.enum(["image", "text", "video"]).optional(),
});

export const listPricingQuerySchema = z.object({
  unit: z.enum(["text_generation", "image_generation", "video_generation"]).optional(),
});

export const upsertPricingSchema = z.object({
  active: z.boolean().optional(),
  minChargeCredits: z.number().int().min(1).max(1_000_000_000),
  model: z.string().trim().min(1).max(255),
  provider: z.string().trim().min(1).max(255),
  route: z.string().trim().min(1).max(255),
  unit: z.string().trim().min(1).max(100),
  unitCredits: z.number().int().min(1).max(1_000_000_000).optional(),
});

export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;
export type CreateModelInput = z.infer<typeof createModelSchema>;
export type CreateProviderInput = z.infer<typeof createProviderSchema>;
export type CreateRouteInput = z.infer<typeof createRouteSchema>;
export type CredentialIdParams = z.infer<typeof credentialIdParamsSchema>;
export type GenerateTextInput = z.infer<typeof generateTextSchema>;
export type ListRuntimeRoutesQuery = z.infer<typeof listRuntimeRoutesQuerySchema>;
export type ListPricingQuery = z.infer<typeof listPricingQuerySchema>;
export type RotateCredentialInput = z.infer<typeof rotateCredentialSchema>;
export type RouteIdParams = z.infer<typeof routeIdParamsSchema>;
export type UpsertPricingInput = z.infer<typeof upsertPricingSchema>;
export type UpdateCredentialInput = z.infer<typeof updateCredentialSchema>;
export type UpdateRouteInput = z.infer<typeof updateRouteSchema>;
