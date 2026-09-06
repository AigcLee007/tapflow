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

const agentReferenceContextItemSchema = z.object({
  assetId: z.string().trim().min(1).max(200),
  kind: z.enum(["artifact", "canvas_node", "upload"]),
  label: z.string().trim().min(1).max(120),
  nodeId: z.string().trim().min(1).max(200).optional(),
  refId: z.string().trim().min(1).max(120),
}).strict();

export const agentReferenceContextSchema = z.object({
  items: z.array(agentReferenceContextItemSchema).max(8).default([]),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.items.forEach((item, index) => {
    if (seen.has(item.refId)) {
      ctx.addIssue({
        code: "custom",
        message: "referenceContext.items must use unique refId values",
        path: ["items", index, "refId"],
      });
    }
    seen.add(item.refId);
  });
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
  }).nullable().optional(),
  prompt: z.string().trim().min(1).max(8000),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  expectedGraphRevision: z.number().int().nonnegative().optional(),
  selectedSkillId: z.string().uuid().nullable().optional(),
  selectedSkillVersion: z.number().int().positive().optional(),
  referenceContext: agentReferenceContextSchema.optional(),
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

export const applyAgentCanvasOpsSchema = z.object({
  expectedRevision: z.number().int().positive().optional(),
  flowId: z.string().uuid(),
  ops: z.array(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("add_node"),
        clientId: z.string().trim().min(1).max(200).optional(),
        data: z.record(z.string(), z.unknown()),
        kind: z.enum(["text", "image", "video", "audio", "upload", "image_editor", "group"]),
        position: z.object({
          x: z.number().finite(),
          y: z.number().finite(),
        }),
        selected: z.boolean().optional(),
      }),
      z.object({
        type: z.literal("update_node_data"),
        nodeId: z.string().trim().min(1).max(200),
        patch: z.record(z.string(), z.unknown()),
      }),
      z.object({
        type: z.literal("delete_nodes"),
        nodeIds: z.array(z.string().trim().min(1).max(200)).min(1),
      }),
      z.object({
        type: z.literal("connect_nodes"),
        source: z.string().trim().min(1).max(200),
        sourceHandle: z.string().trim().min(1).max(120).optional(),
        target: z.string().trim().min(1).max(200),
        targetHandle: z.string().trim().min(1).max(120).optional(),
      }),
      z.object({
        type: z.literal("delete_edges"),
        edgeIds: z.array(z.string().trim().min(1).max(200)).min(1),
      }),
      z.object({
        type: z.literal("select_nodes"),
        nodeIds: z.array(z.string().trim().min(1).max(200)).min(1),
      }),
      z.object({
        type: z.literal("set_viewport"),
        viewport: viewportSchema,
      }),
      z.object({
        type: z.literal("run_node"),
        nodeId: z.string().trim().min(1).max(200),
        runMode: z.literal("target_node"),
      }),
    ]),
  ).min(1),
  turnId: z.string().uuid(),
});

export type AgentSessionIdParams = z.infer<typeof agentSessionIdParamsSchema>;
export type ApproveAgentToolCallInput = z.infer<typeof approveAgentToolCallSchema>;
export type ApplyAgentCanvasOpsInput = z.infer<typeof applyAgentCanvasOpsSchema>;
export type CanvasAgentSnapshotInput = z.infer<typeof canvasAgentSnapshotSchema>;
export type CreateAgentSessionInput = z.infer<typeof createAgentSessionSchema>;
export type CreateAgentMessageInput = z.infer<typeof createAgentMessageSchema>;
export type CreateAgentTurnInput = z.infer<typeof createAgentTurnSchema>;
export type AgentReferenceContextInput = z.infer<typeof agentReferenceContextSchema>;
export type GetAgentEventsQuery = z.infer<typeof getAgentEventsQuerySchema>;
export type GetAgentImageRunSettingsEstimateQuery = z.infer<typeof getAgentImageRunSettingsEstimateQuerySchema>;
export type ListAgentSessionsQuery = z.infer<typeof listAgentSessionsQuerySchema>;
export const executeAgentTurnSchema = createAgentTurnSchema;
export type ExecuteAgentTurnInput = z.infer<typeof executeAgentTurnSchema>;

export const agentV3TaskIdParamsSchema = z.object({ taskId: z.string().trim().min(1).max(200) }).strict();
export const agentV3SessionTurnParamsSchema = z.object({ sessionId: z.string().uuid() }).strict();
export const agentV3EventsQuerySchema = z.object({ after: z.coerce.number().int().nonnegative().optional() }).strict();
export const agentV3ApprovalSchema = z.object({ approved: z.boolean().optional(), input: z.unknown().optional() }).strict();
export const agentV3RetrySchema = z.object({ stepId: z.string().trim().min(1).max(200) }).strict();
export const agentV3UndoSchema = z.object({ expectedRevision: z.number().int().nonnegative() }).strict();
export type AgentV3TaskIdParams = z.infer<typeof agentV3TaskIdParamsSchema>;
export type AgentV3SessionTurnParams = z.infer<typeof agentV3SessionTurnParamsSchema>;
