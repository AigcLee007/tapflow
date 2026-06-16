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

export const createAgentSessionSchema = z.object({
  flowId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(120).optional(),
});

export const createAgentTurnSchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
  snapshot: canvasAgentSnapshotSchema,
});

export type AgentSessionIdParams = z.infer<typeof agentSessionIdParamsSchema>;
export type CanvasAgentSnapshotInput = z.infer<typeof canvasAgentSnapshotSchema>;
export type CreateAgentSessionInput = z.infer<typeof createAgentSessionSchema>;
export type CreateAgentTurnInput = z.infer<typeof createAgentTurnSchema>;
