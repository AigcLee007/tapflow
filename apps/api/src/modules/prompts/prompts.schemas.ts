import { z } from "zod";

export const promptCategories = [
  "portrait",
  "product",
  "ecommerce",
  "scene",
  "illustration",
  "poster",
  "3d",
] as const;

export const promptListQuerySchema = z.object({
  category: z.string().trim().min(1).max(80).optional(),
  cursor: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  query: z.string().trim().max(200).optional(),
  view: z.enum(["featured", "latest", "favorites"]).default("featured"),
});

export const promptIdParamsSchema = z.object({
  promptId: z.string().uuid(),
});

export const promptMediaAssetParamsSchema = z.object({
  assetId: z.string().uuid(),
});

export const promptMediaParamsSchema = z.object({
  mediaId: z.string().uuid(),
  promptId: z.string().uuid(),
});

export const promptMediaOrderSchema = z.object({
  media: z.array(z.object({
    altText: z.string().trim().max(240).optional(),
    id: z.string().uuid(),
    sortOrder: z.number().int().min(0).max(10),
  })).min(1).max(4),
});

export const promptInteractionSchema = z.object({
  eventType: z.enum(["view", "copy", "reference"]),
  projectId: z.string().uuid().optional(),
});

const promptTextSchema = z.string().trim().min(1).max(20_000);
const promptTagsSchema = z.array(z.string().trim().min(1).max(50)).max(20).default([]);

export const promptAdminInputSchema = z.object({
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1_000).default(""),
  externalKey: z.string().trim().min(1).max(160),
  negativePrompt: z.string().trim().max(20_000).optional(),
  promptText: promptTextSchema,
  sortWeight: z.number().int().min(-100_000).max(100_000).default(0),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  tags: promptTagsSchema,
  title: z.string().trim().min(1).max(160),
});

export const promptImportRowSchema = z.object({
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1_000).optional(),
  externalKey: z.string().trim().min(1).max(160),
  negativePrompt: z.string().trim().max(20_000).optional(),
  promptText: promptTextSchema,
  tags: promptTagsSchema.optional(),
  title: z.string().trim().min(1).max(160),
});

export const promptImportSchema = z.object({
  rows: z.array(promptImportRowSchema).min(1).max(500),
});

export const promptStatusSchema = z.object({
  status: z.enum(["draft", "published", "archived"]),
});

export type PromptAdminInput = z.infer<typeof promptAdminInputSchema>;
export type PromptIdParams = z.infer<typeof promptIdParamsSchema>;
export type PromptMediaAssetParams = z.infer<typeof promptMediaAssetParamsSchema>;
export type PromptMediaParams = z.infer<typeof promptMediaParamsSchema>;
export type PromptMediaOrderInput = z.infer<typeof promptMediaOrderSchema>;
export type PromptImportInput = z.infer<typeof promptImportSchema>;
export type PromptInteractionInput = z.infer<typeof promptInteractionSchema>;
export type PromptListQuery = z.infer<typeof promptListQuerySchema>;
export type PromptStatusInput = z.infer<typeof promptStatusSchema>;
