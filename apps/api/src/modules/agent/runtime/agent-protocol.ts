import { z } from "zod";

export const AGENT_PROTOCOL_MAX_BLOCKS = 64;
export const AGENT_PROTOCOL_MAX_QUESTIONS = 4;
export const AGENT_PROTOCOL_MAX_RESULTS = 24;
export const AGENT_PROTOCOL_MAX_TEXT = 4_000;
export const AGENT_PROTOCOL_MAX_REFS = 64;
export const AGENT_PROTOCOL_MAX_IDS = 64;

export const agentPhaseSchema = z.enum([
  "idle", "understanding", "waiting_for_input", "planning", "waiting_for_confirmation",
  "executing", "verifying", "presenting_results", "refining", "failed", "cancelled",
]);

export const agentExecutionStateSchema = z.enum(["idle", "queued", "running", "verifying", "completed", "failed", "cancelled"]);

const idSchema = z.string().trim().min(1);
const nullableIdSchema = idSchema.nullable();
const sourceSchema = z.enum(["canvas", "asset", "upload"]);
const roleSchema = z.enum(["subject", "style", "composition", "layout", "context"]);

export const agentContextRefSchema = z.object({
  refId: idSchema,
  source: sourceSchema,
  nodeId: idSchema.optional(),
  assetId: idSchema.optional(),
  role: roleSchema.optional(),
  label: z.string().trim().min(1),
}).strict();

export const agentContextSnapshotSchema = z.object({
  projectId: nullableIdSchema,
  flowId: nullableIdSchema,
  graphRevision: z.number().int().nonnegative(),
  refs: z.array(agentContextRefSchema).max(AGENT_PROTOCOL_MAX_REFS),
  skillIds: z.array(idSchema).max(AGENT_PROTOCOL_MAX_IDS),
  appIds: z.array(idSchema).max(AGENT_PROTOCOL_MAX_IDS),
  modelKey: nullableIdSchema,
}).strict();

const questionSchema = z.object({
  id: idSchema,
  prompt: z.string().trim().min(1),
  kind: z.enum(["text", "single", "multiple"]).optional(),
  options: z.array(z.string().trim().min(1)).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().trim().min(1).optional(),
}).strict();

const planSchema = z.object({
  title: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1).optional(),
  deliverables: z.array(z.string().trim().min(1)).optional(),
  modelKey: nullableIdSchema.optional(),
  quantity: z.number().int().positive().optional(),
  estimatedCredits: z.number().finite().nonnegative().optional(),
  writesCanvas: z.boolean().optional(),
  capabilities: z.array(idSchema).optional(),
}).strict();

const briefFieldSchema = z.object({ key: idSchema, label: z.string().trim().min(1), value: z.string().trim().min(1) }).strict();
const progressStepSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1),
  status: z.enum(["pending", "running", "completed", "failed"]),
  detail: z.string().trim().min(1).optional(),
}).strict();
const resultRefSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1),
  kind: z.enum(["image", "video", "text", "audio", "other"]).optional(),
  assetId: idSchema.optional(),
  contentText: z.string().trim().min(1).optional(),
  status: z.enum(["ready", "selected", "failed"]).optional(),
  sourceRefs: z.array(idSchema).optional(),
  placedNodeId: idSchema.optional(),
}).strict();

const blockCommon = { type: z.string(), id: idSchema.optional(), title: z.string().trim().min(1).optional() } as const;
const understandingBlockSchema = z.object({ ...blockCommon, type: z.literal("understanding"), text: z.string().trim().min(1) }).strict();
const questionSetBlockSchema = z.object({ ...blockCommon, type: z.literal("question_set"), questions: z.array(questionSchema) }).strict();
const planBlockSchema = z.object({
  ...blockCommon,
  type: z.literal("plan"),
  summary: z.string().trim().min(1).optional(),
  plan: planSchema.optional(),
  deliverables: z.array(z.string().trim().min(1)).optional(),
  modelKey: nullableIdSchema.optional(),
  quantity: z.number().int().positive().optional(),
  estimatedCredits: z.number().finite().nonnegative().optional(),
  writesCanvas: z.boolean().optional(),
  capabilities: z.array(idSchema).optional(),
}).strict();
const briefBlockSchema = z.object({ ...blockCommon, type: z.literal("brief"), text: z.string().trim().min(1).optional(), fields: z.array(briefFieldSchema) }).strict();
const confirmationBlockSchema = z.object({
  ...blockCommon,
  type: z.literal("confirmation"),
  text: z.string().trim().min(1),
  risk: z.string().trim().min(1).optional(),
  estimatedCredits: z.number().finite().nonnegative().optional(),
  quantity: z.number().int().positive().optional(),
  writesCanvas: z.boolean().optional(),
}).strict();
const progressBlockSchema = z.object({ ...blockCommon, type: z.literal("progress"), steps: z.array(progressStepSchema) }).strict();
const resultGroupBlockSchema = z.object({ ...blockCommon, type: z.literal("result_group"), results: z.array(resultRefSchema) }).strict();
const errorRecoveryBlockSchema = z.object({
  ...blockCommon,
  type: z.literal("error_recovery"),
  text: z.string().trim().min(1),
  retryable: z.boolean().optional(),
  refundStatus: z.enum(["pending", "released", "refunded", "not_applicable"]).optional(),
}).strict();

export const conversationBlockSchema = z.discriminatedUnion("type", [
  understandingBlockSchema,
  questionSetBlockSchema,
  planBlockSchema,
  briefBlockSchema,
  confirmationBlockSchema,
  progressBlockSchema,
  resultGroupBlockSchema,
  errorRecoveryBlockSchema,
]);
export const conversationBlocksSchema = z.array(conversationBlockSchema).max(AGENT_PROTOCOL_MAX_BLOCKS);

export const agentDecisionTypeSchema = z.enum([
  "answer_question", "edit_brief", "approve_plan", "revise_plan", "result_action", "cancel_execution", "retry_execution",
]);

export const agentDecisionSchema = z.object({
  type: agentDecisionTypeSchema,
  decisionId: idSchema,
  sessionId: idSchema,
  turnId: idSchema,
  graphRevision: z.number().int().nonnegative(),
  idempotencyKey: idSchema,
  answer: z.record(z.string(), z.unknown()).optional(),
  field: idSchema.optional(),
  value: z.string().trim().min(1).max(AGENT_PROTOCOL_MAX_TEXT).optional(),
  action: idSchema.optional(),
  resultId: idSchema.optional(),
}).strict();

export type AgentPhase = z.infer<typeof agentPhaseSchema>;
export type AgentExecutionState = z.infer<typeof agentExecutionStateSchema>;
export type AgentContextRef = z.infer<typeof agentContextRefSchema>;
export type AgentContextSnapshot = z.infer<typeof agentContextSnapshotSchema>;
export type ConversationBlock = z.infer<typeof conversationBlockSchema>;
export type AgentDecisionType = z.infer<typeof agentDecisionTypeSchema>;
export type AgentDecision = z.infer<typeof agentDecisionSchema>;

export class AgentProtocolError extends Error {
  readonly code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID";

  constructor(code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID", message = code) {
    super(message === code ? code : `${code}: ${message}`);
    this.name = "AgentProtocolError";
    this.code = code;
  }
}

const unsafeKey = (key: string) => {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ["provider", "credential", "credentials", "authorization", "apikey", "apisecret", "secret", "token", "base64", "blob", "data", "signedurl"].includes(normalized);
};

const unsafeString = (value: string) => /^(?:data:|blob:)/i.test(value)
  || /^https?:\/\//i.test(value)
  || /(?:^|[^a-z])base64(?:$|[^a-z])/i.test(value)
  || /(?:authorization\s*:|\b(?:bearer|basic)\s+)/i.test(value)
  || /(?:x-amz-signature|x-amz-credential|signature=|expires=|token=)/i.test(value);

function scanUnsafe(value: unknown): boolean {
  if (typeof value === "string") return unsafeString(value);
  if (Array.isArray(value)) return value.some(scanUnsafe);
  if (value && typeof value === "object") return Object.entries(value).some(([key, child]) => unsafeKey(key) || scanUnsafe(child));
  return false;
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID"): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success || scanUnsafe(value)) throw new AgentProtocolError(code, code);
  return parsed.data;
}

export function normalizeAgentContextSnapshot(input: unknown): AgentContextSnapshot {
  const parsed = parseOrThrow(agentContextSnapshotSchema, input, "AGENT_CONTEXT_UNSAFE");
  const refs: AgentContextRef[] = [];
  const seen = new Set<string>();
  for (const ref of parsed.refs) {
    if (seen.has(ref.refId)) continue;
    seen.add(ref.refId);
    refs.push({ ...ref, label: ref.label.slice(0, AGENT_PROTOCOL_MAX_TEXT) });
  }
  return {
    ...parsed,
    refs,
    skillIds: [...new Set(parsed.skillIds)].slice(0, AGENT_PROTOCOL_MAX_IDS),
    appIds: [...new Set(parsed.appIds)].slice(0, AGENT_PROTOCOL_MAX_IDS),
  };
}

export function normalizeConversationBlocks(input: unknown): ConversationBlock[] {
  if (!Array.isArray(input)) throw new AgentProtocolError("AGENT_BLOCK_INVALID", "AGENT_BLOCK_INVALID");
  const values = input.slice(0, AGENT_PROTOCOL_MAX_BLOCKS);
  const normalized: ConversationBlock[] = [];
  for (const value of values) {
    const block = parseOrThrow(conversationBlockSchema, value, "AGENT_BLOCK_INVALID");
    if (block.type === "question_set") normalized.push({ ...block, questions: block.questions.slice(0, AGENT_PROTOCOL_MAX_QUESTIONS).map((question) => ({ ...question, prompt: question.prompt.slice(0, AGENT_PROTOCOL_MAX_TEXT), ...(question.placeholder ? { placeholder: question.placeholder.slice(0, AGENT_PROTOCOL_MAX_TEXT) } : {}) })) });
    else if (block.type === "result_group") normalized.push({ ...block, results: block.results.slice(0, AGENT_PROTOCOL_MAX_RESULTS).map((result) => ({ ...result, label: result.label.slice(0, AGENT_PROTOCOL_MAX_TEXT), ...(result.contentText ? { contentText: result.contentText.slice(0, AGENT_PROTOCOL_MAX_TEXT) } : {}) })) });
    else normalized.push(block);
  }
  return normalized;
}

export const normalizeAgentBlocks = normalizeConversationBlocks;
