import { z } from "zod";

import { assertAgentOutputSafe } from "./agent-redaction.js";

export const agentToolNameSchema = z.enum([
  "generate_image",
  "generate_image_batch",
  "edit_image",
  "create_canvas_nodes",
  "update_canvas_node",
  "run_canvas_node",
  "continue_generation",
]);

const friendlyStringSchema = z.string().trim().min(1);

export const agentImageSizeSchema = z.enum(["1K", "2K", "4K"]);

export const generateImageToolArgsSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  modelDisplayName: z.string().trim().max(120).optional(),
  prompt: z.string().trim().min(1).max(4000),
  referenceRefs: z.array(friendlyStringSchema.max(120)).max(8).optional(),
  routeLabel: z.string().trim().max(120).optional(),
  size: agentImageSizeSchema.optional(),
}).strict();

export const generateImageBatchToolArgsSchema = z.object({
  images: z.array(
    z.object({
      id: z.string().trim().min(1).max(80).optional(),
      prompt: z.string().trim().min(1).max(4000),
      referenceRefs: z.array(friendlyStringSchema.max(120)).max(8).optional(),
      size: agentImageSizeSchema.optional(),
    }).strict(),
  ).min(2).max(8),
  sharedStyle: z.string().trim().max(1000).optional(),
}).strict();

export const continueGenerationToolArgsSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
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
    arguments: continueGenerationToolArgsSchema,
    toolCallKey: z.string().trim().min(1).max(200),
    toolName: z.literal("continue_generation"),
  }).strict(),
]);

export type AgentToolName = z.infer<typeof agentToolNameSchema>;
export type GenerateImageToolArgs = z.infer<typeof generateImageToolArgsSchema>;
export type GenerateImageBatchToolArgs = z.infer<typeof generateImageBatchToolArgsSchema>;
export type ContinueGenerationToolArgs = z.infer<typeof continueGenerationToolArgsSchema>;
export type ParsedAgentToolCall = z.infer<typeof agentToolCallSchema>;

export function parseAgentToolCall(value: unknown): ParsedAgentToolCall {
  try {
    assertAgentOutputSafe(value);
  } catch (error) {
    throw new Error(`Agent tool call contained internal provider data: ${error instanceof Error ? error.message : String(error)}`);
  }
  return agentToolCallSchema.parse(value);
}
