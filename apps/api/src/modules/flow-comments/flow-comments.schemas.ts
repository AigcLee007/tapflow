import { z } from 'zod';

export const projectCommentParamsSchema = z.object({
  projectId: z.string().uuid(),
});

export const flowCommentIdParamsSchema = z.object({
  commentId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export const createFlowCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  flowId: z.string().uuid().optional(),
  nodeId: z.string().max(160).optional(),
  anchor: z.record(z.string(), z.unknown()).optional(),
});

export const updateFlowCommentSchema = z
  .object({
    body: z.string().trim().min(1).max(2000).optional(),
    status: z.enum(['open', 'resolved']).optional(),
  })
  .refine((value) => value.body !== undefined || value.status !== undefined, {
    message: 'At least one field must be provided',
  });

export type ProjectCommentParams = z.infer<typeof projectCommentParamsSchema>;
export type FlowCommentIdParams = z.infer<typeof flowCommentIdParamsSchema>;
export type CreateFlowCommentInput = z.infer<typeof createFlowCommentSchema>;
export type UpdateFlowCommentInput = z.infer<typeof updateFlowCommentSchema>;
