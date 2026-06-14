import { z } from "zod";

const jsonRecordSchema = z.record(z.string(), z.unknown());
const aiModalitySchema = z.enum(["text", "image", "video"]);
const routeStatusSchema = z.enum(["active", "inactive"]);
const resourceStatusSchema = z.enum(["active", "inactive"]);
const pricingUnitSchema = z.enum(["text_generation", "image_generation", "video_generation"]);
const routeKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(
    /^[a-z0-9](?:[a-z0-9._-]{0,253}[a-z0-9])?$/i,
    "routeKey must contain only letters, numbers, dot, underscore, or hyphen",
  );

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

export const duplicateRouteSchema = z
  .object({
    internalLabel: z.string().trim().min(1).max(255).nullable().optional(),
    isDefault: z.boolean().optional(),
    routeKey: routeKeySchema.optional(),
    routeLabel: z.string().trim().min(1).max(255).nullable().optional(),
  })
  .optional();

export const credentialIdParamsSchema = z.object({
  credentialId: z.string().uuid(),
});

export const connectionIdParamsSchema = z.object({
  connectionId: z.string().uuid(),
});

export const createProviderSchema = z.object({
  capabilities: jsonRecordSchema.optional(),
  defaultBaseUrl: z.string().trim().url().nullable().optional(),
  key: z.string().trim().min(1).max(100),
  kind: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(255),
  status: resourceStatusSchema.optional(),
});

export const createModelSchema = z.object({
  capabilities: jsonRecordSchema.optional(),
  contextWindow: z.number().int().positive().nullable().optional(),
  displayName: z.string().trim().min(1).max(255),
  modality: aiModalitySchema,
  modelKey: z.string().trim().min(1).max(255),
  providerId: z.string().uuid(),
  status: resourceStatusSchema.optional(),
});

export const createRouteSchema = z.object({
  baseUrlOverride: z.string().trim().url().transform(normalizeHttpUrl).nullable().optional(),
  connectionId: z.string().uuid().nullable().optional(),
  credentialId: z.string().uuid().nullable().optional(),
  adminNotes: z.string().trim().max(4000).nullable().optional(),
  apiMode: z.string().trim().min(1).max(100).nullable().optional(),
  fallbackGroup: z.string().trim().min(1).max(255).nullable().optional(),
  internalLabel: z.string().trim().min(1).max(255).nullable().optional(),
  isDefault: z.boolean().optional(),
  modality: aiModalitySchema,
  modelFamily: z.string().trim().min(1).max(255).nullable().optional(),
  modelId: z.string().uuid().nullable().optional(),
  pricing: jsonRecordSchema.optional(),
  priority: z.number().int().min(0).optional(),
  providerId: z.string().uuid(),
  requestPath: z.string().trim().min(1).max(255).nullable().optional(),
  rateLimit: jsonRecordSchema.optional(),
  requestConfig: jsonRecordSchema.optional(),
  routeKey: routeKeySchema,
  routeLabel: z.string().trim().min(1).max(255).nullable().optional(),
  status: routeStatusSchema.optional(),
  upstreamModel: z.string().trim().min(1).max(255).nullable().optional(),
  weight: z.number().int().min(0).optional(),
}).superRefine((value, context) => {
  if (!value.modelId && !value.modelFamily) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either modelId or modelFamily must be provided",
      path: ["modelFamily"],
    });
  }
});

export const updateRouteSchema = z
  .object({
    baseUrlOverride: z.string().trim().url().transform(normalizeHttpUrl).nullable().optional(),
    connectionId: z.string().uuid().nullable().optional(),
    credentialId: z.string().uuid().nullable().optional(),
    adminNotes: z.string().trim().max(4000).nullable().optional(),
    apiMode: z.string().trim().min(1).max(100).nullable().optional(),
    fallbackGroup: z.string().trim().min(1).max(255).nullable().optional(),
    internalLabel: z.string().trim().min(1).max(255).nullable().optional(),
    isDefault: z.boolean().optional(),
    modelId: z.string().uuid().nullable().optional(),
    pricing: jsonRecordSchema.optional(),
    priority: z.number().int().min(0).optional(),
    requestPath: z.string().trim().min(1).max(255).nullable().optional(),
    rateLimit: jsonRecordSchema.optional(),
    requestConfig: jsonRecordSchema.optional(),
    routeLabel: z.string().trim().min(1).max(255).nullable().optional(),
    status: routeStatusSchema.optional(),
    upstreamModel: z.string().trim().min(1).max(255).nullable().optional(),
    weight: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one route field must be provided",
  });

export const createCredentialSchema = z.object({
  name: z.string().trim().min(1).max(255),
  providerId: z.string().uuid(),
  secret: z.string().trim().min(1).max(4000),
  status: resourceStatusSchema.optional(),
});

export const updateCredentialSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    status: resourceStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one credential field must be provided",
  });

export const createProviderConnectionSchema = z.object({
  adapterKind: z.string().trim().min(1).max(100),
  baseUrl: z.string().trim().url().transform(normalizeHttpUrl).nullable().optional(),
  credentialId: z.string().uuid().nullable().optional(),
  environment: z.string().trim().min(1).max(64).optional(),
  metadata: jsonRecordSchema.optional(),
  name: z.string().trim().min(1).max(255),
  providerId: z.string().uuid(),
  status: resourceStatusSchema.optional(),
});

export const updateProviderConnectionSchema = z
  .object({
    adapterKind: z.string().trim().min(1).max(100).optional(),
    baseUrl: z.string().trim().url().transform(normalizeHttpUrl).nullable().optional(),
    credentialId: z.string().uuid().nullable().optional(),
    environment: z.string().trim().min(1).max(64).optional(),
    metadata: jsonRecordSchema.optional(),
    name: z.string().trim().min(1).max(255).optional(),
    status: resourceStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one provider connection field must be provided",
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
  minChargeCredits: z.number().min(0.0001).max(1_000_000_000),
  model: z.string().trim().min(1).max(255),
  provider: z.string().trim().min(1).max(255),
  route: routeKeySchema,
  unit: pricingUnitSchema,
  unitCredits: z.number().min(0.0001).max(1_000_000_000).optional(),
});

export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;
export type CreateModelInput = z.infer<typeof createModelSchema>;
export type CreateProviderInput = z.infer<typeof createProviderSchema>;
export type CreateRouteInput = z.infer<typeof createRouteSchema>;
export type DuplicateRouteInput = z.infer<typeof duplicateRouteSchema>;
export type CredentialIdParams = z.infer<typeof credentialIdParamsSchema>;
export type ConnectionIdParams = z.infer<typeof connectionIdParamsSchema>;
export type CreateProviderConnectionInput = z.infer<typeof createProviderConnectionSchema>;
export type GenerateTextInput = z.infer<typeof generateTextSchema>;
export type ListRuntimeRoutesQuery = z.infer<typeof listRuntimeRoutesQuerySchema>;
export type ListPricingQuery = z.infer<typeof listPricingQuerySchema>;
export type RotateCredentialInput = z.infer<typeof rotateCredentialSchema>;
export type RouteIdParams = z.infer<typeof routeIdParamsSchema>;
export type UpsertPricingInput = z.infer<typeof upsertPricingSchema>;
export type UpdateCredentialInput = z.infer<typeof updateCredentialSchema>;
export type UpdateProviderConnectionInput = z.infer<typeof updateProviderConnectionSchema>;
export type UpdateRouteInput = z.infer<typeof updateRouteSchema>;
