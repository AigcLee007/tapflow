import { z } from "zod";

const id = z.string().trim().min(1).max(200);
const position = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const node = z.object({ id, type: id, position, data: z.record(z.string(), z.unknown()) }).strict();

export const canvasOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("node.create"), node }).strict(),
  z.object({ type: z.literal("node.update_data"), nodeId: id, data: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ type: z.literal("node.delete"), nodeId: id }).strict(),
  z.object({ type: z.literal("edge.connect"), edge: z.object({ id, source: id, target: id, sourceHandle: id.optional(), targetHandle: id.optional() }).strict() }).strict(),
  z.object({ type: z.literal("edge.delete"), edgeId: id }).strict(),
  z.object({ type: z.literal("group.create"), group: z.object({ id, nodeIds: z.array(id).min(1).max(200), label: z.string().max(200).optional() }).strict() }).strict(),
  z.object({ type: z.literal("layout.move"), nodeId: id, position }).strict(),
  z.object({ type: z.literal("selection.set"), nodeIds: z.array(id).max(200) }).strict(),
  z.object({ type: z.literal("result.place"), result: z.object({ assetId: id, position, nodeType: id.optional(), label: z.string().max(200).optional() }).strict() }).strict(),
]);

export type CanvasOperation = z.infer<typeof canvasOperationSchema>;

const forbidden = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const forbiddenKey = /(?:base64|raw(?:media|route)?|signedurl|signed_url|authorization|credential|api[_-]?key|secret|provider|filesystem|shell|mcp|browser|codeexecution|code_execution)/i;

function rejectUnsafe(value: unknown, path: string[] = [], state = { seen: new WeakSet<object>(), nodes: 0 }): unknown {
  if (path.length > 100 || ++state.nodes > 2000) throw new z.ZodError([{ code: "custom", path, message: "Operation payload is too deep or large." }]);
  if (typeof value === "string" && (forbidden.test(value) || value.length > 100_000)) throw new z.ZodError([{ code: "custom", path, message: "Raw media, URLs, or secrets are not allowed." }]);
  if ((typeof File !== "undefined" && value instanceof File) || (typeof Blob !== "undefined" && value instanceof Blob)) throw new z.ZodError([{ code: "custom", path, message: "File and Blob values are not allowed." }]);
  if (Array.isArray(value)) {
    if (state.seen.has(value)) throw new z.ZodError([{ code: "custom", path, message: "Cyclic operation payload is not allowed." }]);
    state.seen.add(value); value.forEach((item, index) => rejectUnsafe(item, [...path, String(index)], state));
  } else if (value && typeof value === "object") {
    if (state.seen.has(value)) throw new z.ZodError([{ code: "custom", path, message: "Cyclic operation payload is not allowed." }]);
    state.seen.add(value); Object.entries(value).forEach(([key, child]) => {
    if (forbiddenKey.test(key)) throw new z.ZodError([{ code: "custom", path: [...path, key], message: "Secret or external capability fields are not allowed." }]);
    rejectUnsafe(child, [...path, key], state);
  }); }
  return value;
}

const boundedAssertions = z.array(z.record(z.string().max(200), z.unknown())).max(24);

export const operationEnvelopeSchema = z.object({
  operationSetId: id, taskId: id, turnId: id, baseRevision: z.number().int().nonnegative(), summary: z.string().trim().min(1).max(2000),
  risk: z.enum(["safe", "destructive", "paid", "batch"]), requiresApproval: z.boolean(), operations: z.array(canvasOperationSchema).min(1).max(24),
  preconditions: boundedAssertions, expectedEffects: boundedAssertions, inverseOperations: z.array(canvasOperationSchema).max(24).optional(),
}).strict().superRefine((value, ctx) => { try { rejectUnsafe(value); } catch (error) { if (error instanceof z.ZodError) error.issues.forEach((issue) => ctx.addIssue(issue)); else ctx.addIssue({ code: "custom", message: "Unsafe operation payload." }); } });

export type CanvasOperationEnvelope = z.infer<typeof operationEnvelopeSchema>;
export const canvasOperationEnvelopeSchema = operationEnvelopeSchema;

export function assertCanvasOperationRevision(envelope: CanvasOperationEnvelope, currentRevision: number): true {
  if (envelope.baseRevision !== currentRevision) throw new Error(`stale canvas revision: expected ${currentRevision}, received ${envelope.baseRevision}`);
  return true;
}
