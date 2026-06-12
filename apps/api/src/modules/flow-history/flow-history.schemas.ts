import { z } from 'zod';

export const projectHistoryParamsSchema = z.object({
  projectId: z.string().uuid(),
});

export const flowHistoryRestoreParamsSchema = z.object({
  projectId: z.string().uuid(),
  versionId: z.string().uuid(),
});

export const createFlowHistorySnapshotSchema = z.object({
  label: z.string().trim().min(1).max(255).optional(),
});

export type ProjectHistoryParams = z.infer<typeof projectHistoryParamsSchema>;
export type FlowHistoryRestoreParams = z.infer<typeof flowHistoryRestoreParamsSchema>;
export type CreateFlowHistorySnapshotInput = z.infer<typeof createFlowHistorySnapshotSchema>;
