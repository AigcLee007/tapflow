import { z } from "zod";

const modelKeySchema = z.string().trim().min(1).max(255);

export const modelCatalogQuerySchema = z.object({
  environment: z.string().trim().min(1).max(64).optional(),
  modality: z.enum(["image", "text", "video"]).optional(),
});

export const modelCatalogBundleQuerySchema = z.object({
  modality: z.enum(["image", "video", "text"]),
  environment: z.string().trim().min(1).default("production"),
});

export const modelCatalogParamsSchema = z.object({
  modelKey: modelKeySchema,
});

export const modelCatalogRoutesQuerySchema = z.object({
  environment: z.string().trim().min(1).max(64).optional(),
});

export type ModelCatalogParams = z.infer<typeof modelCatalogParamsSchema>;
export type ModelCatalogQuery = z.infer<typeof modelCatalogQuerySchema>;
export type ModelCatalogBundleQuery = z.infer<typeof modelCatalogBundleQuerySchema>;
export type ModelCatalogRoutesQuery = z.infer<typeof modelCatalogRoutesQuerySchema>;
