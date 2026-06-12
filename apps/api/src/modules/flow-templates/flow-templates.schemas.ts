import { z } from 'zod';

export const flowTemplateListQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).optional(),
});

export const flowTemplateIdParamsSchema = z.object({
  templateId: z.string().uuid(),
});

export const instantiateFlowTemplateSchema = z.object({
  projectId: z.string().uuid().optional(),
});

export type FlowTemplateListQuery = z.infer<typeof flowTemplateListQuerySchema>;
export type FlowTemplateIdParams = z.infer<typeof flowTemplateIdParamsSchema>;
export type InstantiateFlowTemplateInput = z.infer<typeof instantiateFlowTemplateSchema>;
