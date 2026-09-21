import { z } from "zod";
import { agentContextSnapshotSchema } from "./agent-protocol.js";

const stableId = z.string().trim().min(1).max(200);
const safeText = z.string().trim().min(1).max(4000).refine((value) => !/(?:^|\s)(?:data:|blob:)|base64,|https?:\/\/\S*[?&](?:x-amz-|signature=|token=)/i.test(value), "Unsupported embedded media");
const empty = z.object({}).strict();
const answers = z.record(stableId, z.union([safeText, z.array(safeText).max(24)])).refine((value) => Object.keys(value).length <= 16);
const binding = { decisionId: stableId.optional(), blockId: stableId.optional(), graphRevision: z.number().int().nonnegative(), idempotencyKey: stableId.optional() };
export const agentRuntimeDecisionSchema = z.discriminatedUnion("type", [
  z.object({ ...binding, type: z.literal("answer_question"), payload: z.object({ answers }).strict() }).strict(),
  z.object({ ...binding, type: z.literal("edit_brief"), payload: z.object({ instruction: safeText }).strict() }).strict(),
  z.object({ ...binding, type: z.literal("revise_plan"), payload: z.object({ instruction: safeText }).strict() }).strict(),
  z.object({ ...binding, type: z.literal("approve_plan"), payload: empty }).strict(),
  z.object({ ...binding, type: z.literal("cancel_execution"), payload: empty }).strict(),
  z.object({ ...binding, type: z.literal("retry_execution"), payload: empty }).strict(),
  z.object({ ...binding, type: z.literal("result_action"), payload: z.object({
    action: z.enum(["place", "select", "reference", "variant", "edit"]), resultIds: z.array(stableId).min(1).max(24), instruction: safeText.optional(),
  }).strict() }).strict(),
]);
export type AgentRuntimeDecisionRequest = z.infer<typeof agentRuntimeDecisionSchema>;
export const agentRuntimeTurnSchema = z.object({ prompt: safeText, contextSnapshot: agentContextSnapshotSchema, idempotencyKey: stableId }).strict();
export const agentRuntimeCreateSessionSchema = z.object({ projectId: z.uuid(), flowId: z.uuid(), title: z.string().trim().min(1).max(200).optional(), mode: z.enum(["auto", "manual_confirmation"]).optional() }).strict();
export const agentRuntimeSessionFilterSchema = z.object({ projectId: z.uuid().optional(), flowId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(100).optional() }).strict();
export const agentRuntimeModeSchema = z.object({ mode: z.enum(["auto", "manual_confirmation"]) }).strict();
