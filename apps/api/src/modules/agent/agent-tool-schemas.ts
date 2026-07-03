import { z } from "zod";

import { assertAgentOutputSafe } from "./agent-redaction.js";

export const agentToolNameSchema = z.enum([
  "generate_image",
  "generate_image_batch",
  "edit_image",
  "create_canvas_nodes",
  "update_canvas_node",
  "connect_canvas_nodes",
  "select_canvas_nodes",
  "run_canvas_node",
  "continue_generation",
]);

const friendlyStringSchema = z.string().trim().min(1);

export const agentImageSizeSchema = z.enum(["1K", "2K", "4K"]);

export const generateImageToolArgsSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  aspectRatio: z.string().trim().max(20).optional(),
  format: z.enum(["jpeg", "png", "webp"]).optional(),
  modelDisplayName: z.string().trim().max(120).optional(),
  moderation: z.enum(["auto", "low"]).optional(),
  n: z.number().int().positive().max(4).optional(),
  prompt: z.string().trim().min(1).max(4000),
  quality: z.string().trim().max(40).optional(),
  referenceRefs: z.array(friendlyStringSchema.max(120)).max(8).optional(),
  routeKey: z.string().trim().max(200).optional(),
  routeLabel: z.string().trim().max(120).optional(),
  size: agentImageSizeSchema.optional(),
}).strict();

export const generateImageBatchToolArgsSchema = z.object({
  images: z.array(
    z.object({
      aspectRatio: z.string().trim().max(20).optional(),
      format: z.enum(["jpeg", "png", "webp"]).optional(),
      id: z.string().trim().min(1).max(80).optional(),
      modelDisplayName: z.string().trim().max(120).optional(),
      moderation: z.enum(["auto", "low"]).optional(),
      n: z.number().int().positive().max(4).optional(),
      prompt: z.string().trim().min(1).max(4000),
      quality: z.string().trim().max(40).optional(),
      referenceRefs: z.array(friendlyStringSchema.max(120)).max(8).optional(),
      routeKey: z.string().trim().max(200).optional(),
      routeLabel: z.string().trim().max(120).optional(),
      size: agentImageSizeSchema.optional(),
    }).strict(),
  ).min(2).max(8),
  sharedStyle: z.string().trim().max(1000).optional(),
}).strict();

export const editImageToolArgsSchema = z.object({
  aspectRatio: z.string().trim().max(20).optional(),
  format: z.enum(["jpeg", "png", "webp"]).optional(),
  modelDisplayName: z.string().trim().max(120).optional(),
  moderation: z.enum(["auto", "low"]).optional(),
  n: z.number().int().positive().max(4).optional(),
  prompt: z.string().trim().min(1).max(4000),
  quality: z.string().trim().max(40).optional(),
  referenceRefs: z.array(friendlyStringSchema.max(120)).min(1).max(8),
  routeKey: z.string().trim().max(200).optional(),
  routeLabel: z.string().trim().max(120).optional(),
  size: agentImageSizeSchema.optional(),
}).strict();

export const continueGenerationToolArgsSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
}).strict();

export const createCanvasNodesToolArgsSchema = z.object({
  nodes: z.array(
    z.object({
      clientId: z.string().trim().min(1).max(80).optional(),
      data: z.record(z.string(), z.unknown()).default({}),
      kind: z.enum(["text", "image", "video", "audio", "upload", "image_editor", "group"]),
      position: z.object({
        x: z.number().finite(),
        y: z.number().finite(),
      }),
      selected: z.boolean().optional(),
    }).strict(),
  ).min(1).max(12),
}).strict();

export const updateCanvasNodeToolArgsSchema = z.object({
  nodeId: z.string().trim().min(1).max(200),
  patch: z.record(z.string(), z.unknown()),
}).strict();

export const connectCanvasNodesToolArgsSchema = z.object({
  connections: z.array(
    z.object({
      source: z.string().trim().min(1).max(200),
      sourceHandle: z.string().trim().min(1).max(120).optional(),
      target: z.string().trim().min(1).max(200),
      targetHandle: z.string().trim().min(1).max(120).optional(),
    }).strict(),
  ).min(1).max(24),
}).strict();

export const selectCanvasNodesToolArgsSchema = z.object({
  nodeIds: z.array(z.string().trim().min(1).max(200)).min(1).max(24),
}).strict();

export const runCanvasNodeToolArgsSchema = z.object({
  nodeId: z.string().trim().min(1).max(200),
  runMode: z.literal("target_node").default("target_node"),
}).strict();

export const agentToolCallSchema = z.discriminatedUnion("toolName", [
  z.object({
    arguments: generateImageToolArgsSchema,
    toolCallKey: z.string().trim().min(1).max(200),
    toolName: z.literal("generate_image"),
  }).strict(),
  z.object({
    arguments: generateImageBatchToolArgsSchema,
    toolCallKey: z.string().trim().min(1).max(200),
    toolName: z.literal("generate_image_batch"),
  }).strict(),
  z.object({
    arguments: editImageToolArgsSchema,
    toolCallKey: z.string().trim().min(1).max(200),
    toolName: z.literal("edit_image"),
  }).strict(),
  z.object({
    arguments: createCanvasNodesToolArgsSchema,
    toolCallKey: z.string().trim().min(1).max(200),
    toolName: z.literal("create_canvas_nodes"),
  }).strict(),
  z.object({
    arguments: updateCanvasNodeToolArgsSchema,
    toolCallKey: z.string().trim().min(1).max(200),
    toolName: z.literal("update_canvas_node"),
  }).strict(),
  z.object({
    arguments: connectCanvasNodesToolArgsSchema,
    toolCallKey: z.string().trim().min(1).max(200),
    toolName: z.literal("connect_canvas_nodes"),
  }).strict(),
  z.object({
    arguments: selectCanvasNodesToolArgsSchema,
    toolCallKey: z.string().trim().min(1).max(200),
    toolName: z.literal("select_canvas_nodes"),
  }).strict(),
  z.object({
    arguments: runCanvasNodeToolArgsSchema,
    toolCallKey: z.string().trim().min(1).max(200),
    toolName: z.literal("run_canvas_node"),
  }).strict(),
  z.object({
    arguments: continueGenerationToolArgsSchema,
    toolCallKey: z.string().trim().min(1).max(200),
    toolName: z.literal("continue_generation"),
  }).strict(),
]);

export type AgentToolName = z.infer<typeof agentToolNameSchema>;
export type GenerateImageToolArgs = z.infer<typeof generateImageToolArgsSchema>;
export type GenerateImageBatchToolArgs = z.infer<typeof generateImageBatchToolArgsSchema>;
export type EditImageToolArgs = z.infer<typeof editImageToolArgsSchema>;
export type CreateCanvasNodesToolArgs = z.infer<typeof createCanvasNodesToolArgsSchema>;
export type UpdateCanvasNodeToolArgs = z.infer<typeof updateCanvasNodeToolArgsSchema>;
export type ConnectCanvasNodesToolArgs = z.infer<typeof connectCanvasNodesToolArgsSchema>;
export type SelectCanvasNodesToolArgs = z.infer<typeof selectCanvasNodesToolArgsSchema>;
export type RunCanvasNodeToolArgs = z.infer<typeof runCanvasNodeToolArgsSchema>;
export type ContinueGenerationToolArgs = z.infer<typeof continueGenerationToolArgsSchema>;
export type ParsedAgentToolCall = z.infer<typeof agentToolCallSchema>;

const batchImageSharedArgumentKeys = [
  "aspectRatio",
  "format",
  "modelDisplayName",
  "moderation",
  "n",
  "quality",
  "referenceRefs",
  "routeKey",
  "routeLabel",
  "size",
] as const;

export function parseAgentToolCall(value: unknown): ParsedAgentToolCall {
  try {
    assertAgentOutputSafe(value);
  } catch (error) {
    throw new Error(`Agent tool call contained internal provider data: ${error instanceof Error ? error.message : String(error)}`);
  }
  return agentToolCallSchema.parse(normalizeAgentToolCallShape(value));
}

function normalizeAgentToolCallShape(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (record.toolName !== "generate_image_batch") return value;
  const args = record.arguments;
  if (!args || typeof args !== "object") return value;
  const argRecord = args as Record<string, unknown>;
  const images = Array.isArray(argRecord.images) ? argRecord.images : Array.isArray(argRecord.items) ? argRecord.items : null;
  if (!Array.isArray(images)) return value;
  const normalizedArguments = normalizeAgentBatchArguments(argRecord, images);
  const normalizedImages = normalizedArguments.images;
  if (!Array.isArray(normalizedImages) || normalizedImages.length !== 1) {
    return {
      arguments: normalizedArguments,
      toolCallKey: record.toolCallKey,
      toolName: "generate_image_batch",
    };
  }
  const firstImage = normalizedImages[0];
  if (!firstImage || typeof firstImage !== "object") return value;

  return {
    arguments: firstImage,
    toolCallKey: record.toolCallKey,
    toolName: "generate_image",
  };
}

function normalizeBatchImages(argRecord: Record<string, unknown>, images: unknown[]): unknown[] {
  const sharedSettings = Object.fromEntries(
    batchImageSharedArgumentKeys.flatMap((key) => argRecord[key] === undefined ? [] : [[key, argRecord[key]]]),
  );
  return images.map((image) => {
    if (!image || typeof image !== "object" || Array.isArray(image)) return image;
    return {
      ...sharedSettings,
      ...(image as Record<string, unknown>),
    };
  });
}

function normalizeAgentBatchArguments(argRecord: Record<string, unknown>, images: unknown[]): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(argRecord)) {
    if (key === "images" || key === "items" || (batchImageSharedArgumentKeys as readonly string[]).includes(key)) continue;
    normalized[key] = item;
  }
  normalized.images = normalizeBatchImages(argRecord, images);
  return normalized;
}
