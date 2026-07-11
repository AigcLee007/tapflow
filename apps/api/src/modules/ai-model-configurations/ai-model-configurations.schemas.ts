import { z } from "zod";

const jsonRecordSchema = z.record(z.string(), z.unknown());
const modalitySchema = z.enum(["text", "image", "video"]);
const pricingUnitSchema = z.enum([
  "text_generation",
  "image_generation",
  "video_generation",
]);
const pricingCreditsSchema = z.number().min(0.0001).max(1_000_000_000);
const routeKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(
    /^[a-z0-9](?:[a-z0-9._-]{0,253}[a-z0-9])?$/i,
    "routeKey must contain only letters, numbers, dot, underscore, or hyphen",
  );

const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "URL must use http or https")
  .refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  }, "URL must not contain credentials, query parameters, or a fragment")
  .transform((value) => new URL(value).toString());

const credentialChoiceSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("create"),
      name: z.string().trim().min(1).max(255),
      secret: z.string().trim().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      mode: z.literal("existing"),
      credentialId: z.string().uuid(),
    })
    .strict(),
]);

const connectionChoiceSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("create"),
      name: z.string().trim().min(1).max(255),
      baseUrl: httpUrlSchema,
      environment: z.string().trim().min(1).max(64).default("production"),
    })
    .strict(),
  z
    .object({
      mode: z.literal("existing"),
      connectionId: z.string().uuid(),
    })
    .strict(),
]);

const advancedRouteFields = {
  apiMode: z.string().trim().min(1).max(100).optional(),
  fallbackGroup: z.string().trim().min(1).max(255).optional(),
  priority: z.number().int().min(0).optional(),
  requestConfig: jsonRecordSchema.optional(),
  requestPath: z.string().trim().min(1).max(255).optional(),
  routeKey: routeKeySchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
  weight: z.number().int().min(0).optional(),
};

const routeSchema = z
  .object({
    routeLabel: z.string().trim().min(1).max(255),
    upstreamModel: z.string().trim().min(1).max(255),
    ...advancedRouteFields,
  })
  .strict();

const pricingSchema = z
  .object({
    minChargeCredits: pricingCreditsSchema,
    unit: pricingUnitSchema,
    unitCredits: pricingCreditsSchema,
  })
  .strict();

const customDefinitionSchema = z
  .object({
    provider: z
      .object({
        defaultBaseUrl: httpUrlSchema.optional(),
        key: z.string().trim().min(1).max(100),
        kind: z.literal("openai-compatible"),
        name: z.string().trim().min(1).max(255),
      })
      .strict(),
    model: z
      .object({
        displayName: z.string().trim().min(1).max(255),
        modality: modalitySchema,
        modelFamily: z.string().trim().min(1).max(255),
        modelKey: z.string().trim().min(1).max(255),
      })
      .strict(),
    routeDefaults: z
      .object({
        apiMode: z.string().trim().min(1).max(100).optional(),
        mode: z.enum(["async", "stream", "sync"]).optional(),
        requestConfig: jsonRecordSchema.optional(),
        requestPath: z.string().trim().min(1).max(255).optional(),
        timeoutMs: z.number().int().positive().optional(),
      })
      .strict(),
  })
  .strict();

const commonDraftFields = {
  connection: connectionChoiceSchema,
  credential: credentialChoiceSchema,
  expectedRevision: z.number().int().positive().optional(),
  pricing: pricingSchema,
  route: routeSchema,
  routeId: z.string().uuid().optional(),
};

const builtInDraftSchema = z
  .object({
    ...commonDraftFields,
    packageKey: z.string().trim().min(1).max(255),
  })
  .strict();

const customDraftSchema = z
  .object({
    ...commonDraftFields,
    custom: customDefinitionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const expectedUnit = `${value.custom.model.modality}_generation`;
    if (value.pricing.unit !== expectedUnit) {
      context.addIssue({
        code: "custom",
        message: `pricing.unit must be ${expectedUnit} for ${value.custom.model.modality} models`,
        path: ["pricing", "unit"],
      });
    }
  });

export const saveModelConfigurationDraftSchema = z
  .union([builtInDraftSchema, customDraftSchema])
  .superRefine((value, context) => {
    if ((value.routeId === undefined) !== (value.expectedRevision === undefined)) {
      context.addIssue({
        code: "custom",
        message: "routeId and expectedRevision must be provided together",
        path: value.routeId === undefined ? ["routeId"] : ["expectedRevision"],
      });
    }
  });

export const publishModelConfigurationSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    routeId: z.string().uuid(),
  })
  .strict();

export type SaveModelConfigurationDraftInput = z.infer<
  typeof saveModelConfigurationDraftSchema
>;
export type PublishModelConfigurationInput = z.infer<typeof publishModelConfigurationSchema>;
