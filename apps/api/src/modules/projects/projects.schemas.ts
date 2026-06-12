import { z } from "zod";

export const projectIdParamsSchema = z.object({
  projectId: z.string().uuid(),
});

export const listProjectsQuerySchema = z.object({
  coverExpiresInSeconds: z.coerce.number().int().min(60).max(3600).optional(),
  includeCoverUrl: z.coerce.boolean().optional(),
});

export const createProjectSchema = z.object({
  description: z.string().trim().max(2000).nullable().optional(),
  name: z.string().trim().min(1).max(255),
});

export const updateProjectSchema = z
  .object({
    coverAssetId: z.string().uuid().nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    name: z.string().trim().min(1).max(255).optional(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined || value.coverAssetId !== undefined, {
    message: "At least one field must be provided",
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
