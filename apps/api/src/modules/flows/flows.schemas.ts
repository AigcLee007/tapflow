import { z } from "zod";

const graphNodeSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  id: z.string().min(1),
  type: z.string().min(1),
});

const graphEdgeSchema = z.object({
  id: z.string().min(1).optional(),
  source: z.string().min(1),
  sourceHandle: z.string().min(1).optional(),
  target: z.string().min(1),
  targetHandle: z.string().min(1).optional(),
});

export const flowGraphSchema = z.object({
  edges: z.array(graphEdgeSchema),
  nodes: z.array(graphNodeSchema),
  viewport: z.record(z.string(), z.unknown()).optional(),
});

const draftViewportSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().finite().positive(),
});

const draftGraphSchema = z.object({
  edges: z.array(z.record(z.string(), z.unknown())),
  nodes: z.array(z.record(z.string(), z.unknown())),
  projectStudios: z.object({
    director3d: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  viewport: draftViewportSchema,
});

export const projectIdParamsSchema = z.object({
  projectId: z.string().uuid(),
});

export const flowIdParamsSchema = z.object({
  flowId: z.string().uuid(),
});

export const createFlowSchema = z.object({
  description: z.string().trim().max(2000).nullable().optional(),
  title: z.string().trim().min(1).max(255),
});

export const updateFlowSchema = z
  .object({
    description: z.string().trim().max(2000).nullable().optional(),
    title: z.string().trim().min(1).max(255).optional(),
  })
  .refine((value) => value.title !== undefined || value.description !== undefined, {
    message: "At least one field must be provided",
  });

export const publishFlowSchema = z.object({
  changelog: z.string().trim().max(4000).nullable().optional(),
  graph: flowGraphSchema,
});

export const saveFlowDraftSchema = z.object({
  expectedRevision: z.number().int().positive().optional(),
  graph: draftGraphSchema.optional(),
  graphJson: draftGraphSchema.optional(),
  graph_json: draftGraphSchema.optional(),
}).refine((value) => value.graph || value.graphJson || value.graph_json, {
  message: "缺少画布图数据",
});

export type CreateFlowInput = z.infer<typeof createFlowSchema>;
export type FlowGraphInput = z.infer<typeof flowGraphSchema>;
export type FlowIdParams = z.infer<typeof flowIdParamsSchema>;
export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
export type PublishFlowInput = z.infer<typeof publishFlowSchema>;
export type SaveFlowDraftInput = z.infer<typeof saveFlowDraftSchema>;
export type UpdateFlowInput = z.infer<typeof updateFlowSchema>;
