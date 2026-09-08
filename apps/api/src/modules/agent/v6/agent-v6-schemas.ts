import { z } from "zod";

const uuid = z.string().uuid();
const mode = z.enum(["auto", "manual_confirmation"]);

export const agentV6ScopeSchema = z.object({
  flowId: uuid.nullable(),
  graphRevision: z.number().int().nonnegative(),
  projectId: uuid.nullable(),
}).strict();

export const agentV6ContextSnapshotSchema = z.object({
  appRefs: z.array(z.string().trim().min(1).max(200)).max(12),
  assetRefs: z.array(z.object({
    assetId: z.string().trim().min(1).max(200),
    label: z.string().trim().min(1).max(400),
    nodeId: z.string().trim().min(1).max(200).optional(),
    refId: z.string().trim().min(1).max(200),
  }).strict()).max(12),
  flowId: uuid.nullable(),
  graphRevision: z.number().int().nonnegative(),
  modelKey: z.string().trim().min(1).max(200).nullable(),
  projectId: uuid.nullable(),
  selectedNodeIds: z.array(z.string().trim().min(1).max(200)).max(12),
  skillRefs: z.array(z.object({ id: z.string().trim().min(1).max(200), version: z.number().int().nonnegative() }).strict()).max(12),
  uploadedAssetIds: z.array(z.string().trim().min(1).max(200)).max(12),
}).strict();

export const agentV6TurnSchema = agentV6ScopeSchema.extend({
  contextSnapshot: agentV6ContextSnapshotSchema.optional(),
  idempotencyKey: z.string().trim().min(1).max(200),
  mode,
  modelKey: z.string().trim().min(1).max(200).nullable().optional(),
  prompt: z.string().trim().min(1).max(8_000),
  referenceContext: z.object({ items: z.array(z.object({
    assetId: z.string().trim().min(1).max(200),
    kind: z.enum(["artifact", "canvas_node", "upload"]),
    label: z.string().trim().min(1).max(120),
    nodeId: z.string().trim().min(1).max(200).optional(),
    refId: z.string().trim().min(1).max(120),
  }).strict()).max(8) }).strict().optional(),
  snapshot: z.unknown().optional(),
}).strict();

const decisionBase = {
  flowId: uuid.nullable(),
  graphRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(1).max(200),
  projectId: uuid.nullable(),
};

export const agentV6DecisionSchema = z.discriminatedUnion("type", [
  z.object({ ...decisionBase, blockId: z.string().trim().min(1).max(200), optionId: z.string().trim().min(1).max(200), type: z.literal("select_choice") }).strict(),
  z.object({ ...decisionBase, field: z.string().trim().min(1).max(120), type: z.literal("update_brief"), value: z.string().trim().min(1).max(4_000) }).strict(),
  z.object({ ...decisionBase, type: z.literal("confirm") }).strict(),
  z.object({ ...decisionBase, reason: z.string().trim().min(1).max(1_000).optional(), type: z.literal("cancel") }).strict(),
  z.object({ ...decisionBase, prompt: z.string().trim().min(1).max(4_000).optional(), resultId: z.string().trim().min(1).max(200).optional(), type: z.literal("refine") }).strict(),
]);

export type AgentV6ScopeInput = z.infer<typeof agentV6ScopeSchema>;
export type AgentV6ContextSnapshotInput = z.infer<typeof agentV6ContextSnapshotSchema>;
export type AgentV6TurnInput = z.infer<typeof agentV6TurnSchema>;
export type AgentV6DecisionInput = z.infer<typeof agentV6DecisionSchema>;
