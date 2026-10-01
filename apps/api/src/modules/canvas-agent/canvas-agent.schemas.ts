import { z } from "zod";

const uuid = z.string().uuid();

export const canvasSnapshotSchema = z.object({
  nodes: z.array(z.object({
    assetId: z.string().trim().max(120).nullable().optional(),
    id: z.string().trim().min(1).max(120),
    prompt: z.string().max(2000).nullable().optional(),
    status: z.string().trim().max(40).nullable().optional(),
    title: z.string().max(200).nullable().optional(),
    type: z.string().trim().min(1).max(40),
  }).strict()).max(500),
  revision: z.number().int().min(0),
  selectedNodeIds: z.array(z.string().trim().min(1).max(120)).max(200),
}).strict();

export const createSessionSchema = z.object({
  flowId: uuid,
  mode: z.enum(["manual", "auto"]).optional(),
}).strict();

export const listSessionsQuerySchema = z.object({ flowId: uuid }).strict();

export const updateSessionSchema = z.object({
  mode: z.enum(["manual", "auto"]).optional(),
  title: z.string().trim().min(1).max(60).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "至少修改一个字段");

export const postMessageSchema = z.object({
  canvas: canvasSnapshotSchema.nullable().optional(),
  content: z.string().max(8000),
}).strict();

export const resumeSchema = z.object({
  callId: z.string().trim().min(1).max(200),
  canvas: canvasSnapshotSchema.nullable().optional(),
  // Shape depends on the pending kind; validated by the service.
  payload: z.unknown(),
}).strict();

export const sessionParamsSchema = z.object({ sessionId: uuid }).strict();
export const flowParamsSchema = z.object({ flowId: uuid }).strict();
export const fileParamsSchema = z.object({ flowId: uuid, path: z.string().trim().min(1).max(100) }).strict();
