import { z } from "zod";
import { V4_TOOL_NAMES, type AgentV4ToolCall, type AgentV4ToolName } from "./agent-v4-types.js";
import { canvasOperationSchema } from "../v3/canvas-operation-schema.js";

const id = z.string().trim().min(1).max(200);
const loose = z.record(z.string(), z.unknown());
const suitePlanSchema = z.object({
  mainImageCount: z.number().int().min(1).max(24).optional(),
  detailPageCount: z.number().int().min(1).max(24).optional(),
  targetPlatform: z.string().max(120).optional(),
  pages: z.array(z.object({ pageKey: id, purpose: z.string().max(1000) }).strict()).max(24).optional(),
}).strict();
const visualBibleSchema = z.object({
  productLock: z.string().max(2000).optional(), palette: z.array(z.string().max(120)).max(24).optional(),
  lighting: z.string().max(1000).optional(), background: z.string().max(1000).optional(), typography: z.string().max(1000).optional(),
  composition: z.string().max(1000).optional(), prohibitions: z.array(z.string().max(500)).max(24).optional(),
}).strict();
const refIds = z.array(id).max(16);
const batchItem = z.object({ itemId: id, pageKey: id, prompt: z.string().trim().min(1).max(8000), referenceAssetIds: refIds }).strict();
const unsafeOperationKey = /(?:base64|raw(?:media|route)?|signedurl|signed_url|authorization|credential|api[_-]?key|secret|provider|filesystem|shell|mcp|browser|codeexecution|code_execution)/i;
const unsafeOperationValue = /(?:data\s*:|blob\s*:|[a-z][a-z0-9+.-]*:\/\/|(?:javascript|mailto):|\b(?:sk|rk|pk)-[a-z0-9_-]{8,}|\b(?:token|api[_-]?key|secret)\s*[:=])/i;
function assertSafeOperationPayload(value: unknown, path: (string | number)[] = []): string | null {
  if (path.length > 100) return "Operation payload is too deep.";
  if ((typeof File !== "undefined" && value instanceof File) || (typeof Blob !== "undefined" && value instanceof Blob)) return "File and Blob values are not allowed.";
  if (typeof value === "string") return unsafeOperationValue.test(value.trim()) || value.length > 100_000 ? "Raw media, URLs, or secrets are not allowed." : null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const issue = assertSafeOperationPayload(value[index], [...path, index]);
      if (issue) return issue;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (unsafeOperationKey.test(key)) return "Secret or external capability fields are not allowed.";
      const issue = assertSafeOperationPayload(child, [...path, key]);
      if (issue) return issue;
    }
  }
  return null;
}
const safeCanvasOperations = z.array(canvasOperationSchema).max(24).superRefine((value, ctx) => {
  const issue = assertSafeOperationPayload(value);
  if (issue) ctx.addIssue({ code: "custom", message: issue });
});

export const v4ToolInputSchemas = {
  "canvas.observe": z.object({ projectId: id.optional(), flowId: id.optional() }).strict(),
  "reference.inspect": z.object({ referenceAssetIds: refIds }).strict(),
  "product.analyze": z.object({ referenceAssetIds: refIds, prompt: z.string().trim().min(1).max(4000).optional() }).strict(),
  "suite.plan": z.object({ prompt: z.string().trim().min(1).max(8000), mainImageCount: z.number().int().min(1).max(24).optional(), detailPageCount: z.number().int().min(1).max(24).optional() }).strict(),
  "visual_bible.create": z.object({ productSummary: z.string().trim().min(1).max(8000), suitePlan: suitePlanSchema }).strict(),
  "prompt_set.create": z.object({ visualBible: visualBibleSchema, suitePlan: suitePlanSchema, pages: z.array(z.object({ pageKey: id, purpose: z.string().trim().min(1).max(1000) }).strict()).min(1).max(24) }).strict(),
  "image.generate_base": z.object({ prompt: z.string().trim().min(1).max(8000), referenceAssetIds: refIds }).strict(),
  "image.generate_batch": z.object({ items: z.array(batchItem).min(2).max(12) }).strict().superRefine((value, ctx) => {
    const itemIds = new Set<string>(); const pageKeys = new Set<string>();
    value.items.forEach((item, index) => { if (itemIds.has(item.itemId)) ctx.addIssue({ code: "custom", path: ["items", index, "itemId"], message: "itemId must be unique" }); itemIds.add(item.itemId); if (pageKeys.has(item.pageKey)) ctx.addIssue({ code: "custom", path: ["items", index, "pageKey"], message: "pageKey must be unique" }); pageKeys.add(item.pageKey); });
  }),
  "generation.continue": z.object({ baseAssetId: id.optional(), previousItemIds: z.array(id).min(1).max(24).optional(), prompt: z.string().trim().min(1).max(8000) }).strict().refine((value) => Boolean(value.baseAssetId || value.previousItemIds?.length), { message: "A base asset or previous item is required." }),
  "canvas.preview_operations": z.object({ operations: safeCanvasOperations, expectedRevision: z.number().int().nonnegative().optional() }).strict(),
  "canvas.commit_operations": z.object({ expectedRevision: z.number().int().nonnegative(), operations: safeCanvasOperations, operationSetId: id.optional() }).strict(),
} satisfies Record<AgentV4ToolName, z.ZodTypeAny>;

/** OpenAI Responses-compatible function definitions. Zod strict objects emit additionalProperties:false. */
export const v4ToolJsonSchemas = Object.fromEntries(
  Object.entries(v4ToolInputSchemas).map(([name, schema]) => [name, z.toJSONSchema(schema as z.ZodType)]),
) as unknown as Record<AgentV4ToolName, Record<string, unknown>>;
export const v4ToolDefinitions = V4_TOOL_NAMES.map((name) => ({ type: "function" as const, name, description: `Agent V4 ${name} operation`, parameters: v4ToolJsonSchemas[name] }));
export const getV4ToolDefinitions = () => v4ToolDefinitions;

export const agentV4TurnInputSchema = z.object({ prompt: z.string().trim().min(1).max(20_000), snapshot: loose.optional(), referenceContext: z.array(z.object({ assetId: id, refId: id.optional(), label: z.string().max(200).optional() }).strict()).max(16).optional(), idempotencyKey: id.optional(), expectedGraphRevision: z.number().int().nonnegative().optional() }).strict();
export const agentV4RetryItemInputSchema = z.object({ itemId: id, idempotencyKey: id.optional() }).strict();
export const agentV4UndoInputSchema = z.object({ expectedRevision: z.number().int().nonnegative(), idempotencyKey: id.optional() }).strict();
export const retryV4ItemSchema = agentV4RetryItemInputSchema;
export const undoV4CanvasSchema = agentV4UndoInputSchema;
export const v4TurnInputSchema = agentV4TurnInputSchema;

export function parseV4ToolCall(input: { name: string; arguments: string | unknown } | null | undefined): AgentV4ToolCall {
  if (!input || typeof input !== "object" || typeof input.name !== "string" || !V4_TOOL_NAMES.includes(input.name as AgentV4ToolName)) throw new Error("AGENT_V4_UNKNOWN_TOOL");
  let args: unknown = input.arguments;
  if (typeof args === "string") { try { args = JSON.parse(args); } catch { throw new Error("AGENT_V4_INVALID_TOOL_ARGUMENTS"); } }
  const parsed = v4ToolInputSchemas[input.name as AgentV4ToolName].parse(args);
  return { name: input.name as AgentV4ToolName, arguments: parsed as Record<string, unknown> };
}

export type AgentV4TurnInput = z.infer<typeof agentV4TurnInputSchema>;
