import { z } from "zod";

export const viewportSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().finite().positive(),
});

export const canvasAgentSnapshotSchema = z.object({
  edges: z.array(
    z.object({
      id: z.string().min(1),
      source: z.string().min(1),
      sourceHandle: z.string().nullable().optional(),
      target: z.string().min(1),
      targetHandle: z.string().nullable().optional(),
    }),
  ),
  flowId: z.string().uuid().nullable(),
  nodeOutputs: z.record(
    z.string(),
    z.object({
      errorMessage: z.string().nullable(),
      text: z.string().nullable(),
    }),
  ),
  nodes: z.array(
    z.object({
      assetId: z.string().optional(),
      errorMessage: z.string().optional(),
      id: z.string().min(1),
      kind: z.enum(["text", "image", "video", "audio", "upload", "image_editor", "group"]),
      position: z.object({
        x: z.number().finite(),
        y: z.number().finite(),
      }),
      selected: z.boolean(),
      status: z.string().optional(),
      title: z.string().min(1),
    }),
  ),
  projectId: z.string().uuid().nullable(),
  selectedNodeIds: z.array(z.string().min(1)),
  viewport: viewportSchema,
});

export const agentSessionIdParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

export const listAgentSessionsQuerySchema = z.object({
  flowId: z.string().uuid().nullable().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  projectId: z.string().uuid().nullable().optional(),
});

export const getAgentEventsQuerySchema = z.object({
  afterSeq: z.coerce.number().int().nonnegative().optional(),
});

export const getAgentImageRunSettingsEstimateQuerySchema = z.object({
  routeKey: z.string().trim().min(1).max(200),
  size: z.enum(["1K", "2K", "4K"]),
});

export const createAgentSessionSchema = z.object({
  flowId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(120).optional(),
});

export const createAgentTurnSchema = z.object({
  continuationContext: z.object({
    action: z.enum(["compare", "continue-edit", "make-poster", "make-variant"]),
    assetId: z.string().trim().min(1).max(200),
    assetIds: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
    assetLabel: z.string().trim().min(1).max(200),
    assetLabels: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
    assetRefId: z.string().trim().min(1).max(200),
    assetRefIds: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
    promptSummary: z.string().trim().max(2000),
  }).nullable().optional(),
  prompt: z.string().trim().min(1).max(8000),
  snapshot: canvasAgentSnapshotSchema,
});

export const createAgentMessageSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const approveAgentToolCallSchema = z.object({
  settings: z.object({
    aspectRatio: z.string().trim().max(20).optional(),
    format: z.enum(["jpeg", "png", "webp"]).optional(),
    modelDisplayName: z.string().trim().max(120).optional(),
    moderation: z.enum(["auto", "low"]).optional(),
    n: z.number().int().positive().max(4).optional(),
    quality: z.string().trim().max(40).optional(),
    routeKey: z.string().trim().max(200).optional(),
    routeLabel: z.string().trim().max(120).optional(),
    size: z.enum(["1K", "2K", "4K"]).optional(),
  }).optional(),
  toolCallKey: z.string().trim().min(1).max(200),
  turnId: z.string().uuid(),
});

export type AgentSessionIdParams = z.infer<typeof agentSessionIdParamsSchema>;
export type ApproveAgentToolCallInput = z.infer<typeof approveAgentToolCallSchema>;
export type CanvasAgentSnapshotInput = z.infer<typeof canvasAgentSnapshotSchema>;
export type CreateAgentSessionInput = z.infer<typeof createAgentSessionSchema>;
export type CreateAgentMessageInput = z.infer<typeof createAgentMessageSchema>;
export type CreateAgentTurnInput = z.infer<typeof createAgentTurnSchema>;
export type GetAgentEventsQuery = z.infer<typeof getAgentEventsQuerySchema>;
export type GetAgentImageRunSettingsEstimateQuery = z.infer<typeof getAgentImageRunSettingsEstimateQuerySchema>;
export type ListAgentSessionsQuery = z.infer<typeof listAgentSessionsQuerySchema>;
export const executeAgentTurnSchema = createAgentTurnSchema;
export type ExecuteAgentTurnInput = z.infer<typeof executeAgentTurnSchema>;
