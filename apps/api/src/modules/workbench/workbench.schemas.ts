import { z } from "zod";

export const workbenchGenerationIdParamsSchema = z.object({
  generationId: z.string().uuid(),
});

export const workbenchResultIdParamsSchema = z.object({
  resultId: z.string().uuid(),
});

export const listWorkbenchGenerationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const workbenchDisplayModeSchema = z.enum(["merged", "separate"]);

export const createWorkbenchGenerationSchema = z.object({
  displayMode: workbenchDisplayModeSchema.default("merged"),
  idempotencyKey: z.string().min(8).max(160).optional(),
  modelId: z.string().min(1).max(160),
  params: z.record(z.string(), z.unknown()).default({}),
  prompt: z.string().trim().min(1).max(8000),
  referenceAssetIds: z.array(z.string().uuid()).max(8).default([]),
  requestedCount: z.number().int().min(1).max(8).default(1),
  routeKey: z.string().min(1).max(200),
  sessionId: z.string().uuid().optional(),
});

export const sendWorkbenchResultToProjectSchema = z
  .object({
    projectId: z.string().uuid().optional(),
    projectName: z.string().trim().min(1).max(120).optional(),
  })
  .refine((value) => Boolean(value.projectId || value.projectName), {
    message: "Either projectId or projectName is required",
    path: ["projectId"],
  });

export type CreateWorkbenchGenerationInput = z.infer<typeof createWorkbenchGenerationSchema>;
export type ListWorkbenchGenerationsQuery = z.infer<typeof listWorkbenchGenerationsQuerySchema>;
export type SendWorkbenchResultToProjectInput = z.infer<typeof sendWorkbenchResultToProjectSchema>;
export type WorkbenchGenerationIdParams = z.infer<typeof workbenchGenerationIdParamsSchema>;
export type WorkbenchResultIdParams = z.infer<typeof workbenchResultIdParamsSchema>;
