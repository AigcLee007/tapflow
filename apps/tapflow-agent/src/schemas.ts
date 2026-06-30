import { z } from "zod";

export const tapflowCanvasOpSchema = z.discriminatedUnion("type", [
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
    viewport: z.object({
      x: z.number().finite(),
      y: z.number().finite(),
      zoom: z.number().finite().positive(),
    }),
  }),
  z.object({
    type: z.literal("run_node"),
    nodeId: z.string().trim().min(1).max(200),
    runMode: z.literal("target_node"),
  }),
]);

export const tapflowCanvasStateSchema = z.object({
  edges: z.array(z.record(z.string(), z.unknown())),
  nodes: z.array(z.record(z.string(), z.unknown())),
  viewport: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().finite().positive(),
  }),
  revision: z.number().int().nonnegative(),
});

export const tapflowAgentSessionSchema = z.object({
  createdAt: z.string(),
  flowId: z.string().nullable(),
  id: z.string(),
  projectId: z.string().nullable(),
  status: z.string().optional(),
  title: z.string(),
  updatedAt: z.string().optional(),
});

export type TapflowCanvasOp = z.infer<typeof tapflowCanvasOpSchema>;
export type TapflowCanvasState = z.infer<typeof tapflowCanvasStateSchema>;
export type TapflowAgentSession = z.infer<typeof tapflowAgentSessionSchema>;
