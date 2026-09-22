import { z } from "zod";

export const AGENT_PROTOCOL_MAX_BLOCKS = 64;
export const AGENT_PROTOCOL_MAX_QUESTIONS = 4;
export const AGENT_PROTOCOL_MAX_RESULTS = 24;
export const AGENT_PROTOCOL_MAX_REFS = 64;
export const AGENT_PROTOCOL_TEXT_MAX = 4_000;
export const AGENT_PROTOCOL_ID_MAX = 200;

export const agentPhaseSchema = z.enum([
  "idle", "understanding", "waiting_for_input", "planning", "waiting_for_confirmation",
  "executing", "verifying", "presenting_results", "refining", "failed", "cancelled",
]);
export type AgentPhase = z.infer<typeof agentPhaseSchema>;

export const agentExecutionStateSchema = z.enum(["idle", "queued", "running", "verifying", "completed", "failed", "cancelled"]);
export type AgentExecutionState = z.infer<typeof agentExecutionStateSchema>;

export const agentDecisionTypeSchema = z.enum([
  "answer_question", "edit_brief", "approve_plan", "revise_plan", "result_action", "cancel_execution", "retry_execution",
]);
export type AgentDecisionType = z.infer<typeof agentDecisionTypeSchema>;

const nonEmptyText = (max = AGENT_PROTOCOL_TEXT_MAX) => z.string().trim().min(1).max(max);
const idSchema = nonEmptyText(AGENT_PROTOCOL_ID_MAX);
const roleSchema = z.enum(["subject", "style", "composition", "layout", "context"]);
const sourceSchema = z.enum(["canvas", "asset", "upload"]);

export const agentContextRefSchema = z.object({
  refId: idSchema,
  source: sourceSchema,
  nodeId: idSchema.optional(),
  assetId: idSchema.optional(),
  role: roleSchema.optional(),
  label: nonEmptyText(),
}).strict();

export const agentContextSnapshotSchema = z.object({
  projectId: idSchema.nullable(),
  flowId: idSchema.nullable(),
  graphRevision: z.number().int().nonnegative(),
  refs: z.array(agentContextRefSchema).max(AGENT_PROTOCOL_MAX_REFS),
  skillIds: z.array(idSchema).max(AGENT_PROTOCOL_MAX_REFS),
  appIds: z.array(idSchema).max(AGENT_PROTOCOL_MAX_REFS),
  modelKey: idSchema.nullable(),
}).strict();

export type AgentContextRef = z.infer<typeof agentContextRefSchema>;
export type AgentContextSnapshot = z.infer<typeof agentContextSnapshotSchema>;

const questionOptionSchema = z.object({ id: idSchema, label: nonEmptyText() }).strict();
const questionSchema = z.object({
  id: idSchema,
  prompt: nonEmptyText(),
  kind: z.enum(["text", "single", "multiple"]),
  options: z.array(questionOptionSchema).max(24).optional(),
  required: z.boolean().optional(),
}).strict();

const deliverableSchema = z.object({
  id: idSchema,
  label: nonEmptyText(),
  kind: z.enum(["image", "video", "text"]),
  quantity: z.number().int().nonnegative().optional(),
}).strict();

const common = { id: idSchema.optional(), title: nonEmptyText().optional() } as const;
const understandingSchema = z.object({ type: z.literal("understanding"), ...common, text: nonEmptyText() }).strict();
const questionSetSchema = z.object({ type: z.literal("question_set"), ...common, questions: z.array(questionSchema).max(AGENT_PROTOCOL_MAX_QUESTIONS) }).strict();
const planSchema = z.object({
  type: z.literal("plan"), ...common,
  summary: nonEmptyText().optional(),
  deliverables: z.array(deliverableSchema).max(24).default([]),
  capabilities: z.array(idSchema).max(24).optional(),
  references: z.array(idSchema).max(24).optional(),
  modelKey: idSchema.nullable().optional(),
  quantity: z.number().int().nonnegative().optional(),
  estimatedCredits: z.number().nonnegative().optional(),
  writes: z.array(nonEmptyText(200)).max(24).optional(),
  requiresConfirmation: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.summary && value.deliverables.length === 0) ctx.addIssue({ code: "custom", path: ["deliverables"], message: "plan requires summary or deliverables" });
});
const briefFieldSchema = z.object({ key: idSchema.optional(), label: nonEmptyText(), value: nonEmptyText(), required: z.boolean().optional() }).strict();
const briefSchema = z.object({ type: z.literal("brief"), ...common, fields: z.array(briefFieldSchema).max(64), editable: z.boolean().optional() }).strict();
const confirmationSchema = z.object({
  type: z.literal("confirmation"), ...common, text: nonEmptyText(), risk: nonEmptyText().optional(), costCredits: z.number().nonnegative().optional(), quantity: z.number().int().nonnegative().optional(),
  writes: z.array(nonEmptyText(200)).max(24).optional(), confirmLabel: nonEmptyText(120).optional(), reviseLabel: nonEmptyText(120).optional(),
}).strict();
const progressStepSchema = z.object({ id: idSchema, label: nonEmptyText(), status: z.enum(["pending", "running", "completed", "failed"]), detail: nonEmptyText().optional() }).strict();
const progressSchema = z.object({ type: z.literal("progress"), ...common, steps: z.array(progressStepSchema).max(64) }).strict();
const resultSchema = z.object({
  id: idSchema, label: nonEmptyText(), kind: z.enum(["image", "video", "text"]).optional(), assetId: idSchema.optional(), refId: idSchema.optional(), runId: idSchema.optional(), status: z.enum(["pending", "ready", "selected", "failed"]).optional(), sourceRefs: z.array(idSchema).max(24).optional(),
}).strict();
const resultGroupSchema = z.object({ type: z.literal("result_group"), ...common, results: z.array(resultSchema).max(AGENT_PROTOCOL_MAX_RESULTS) }).strict();
const recoveryActionSchema = z.object({ id: idSchema, label: nonEmptyText(), action: z.enum(["retry", "revise", "dismiss"]) }).strict();
const errorRecoverySchema = z.object({ type: z.literal("error_recovery"), ...common, message: nonEmptyText(), actions: z.array(recoveryActionSchema).max(24) }).strict();

export const conversationBlockSchema = z.discriminatedUnion("type", [understandingSchema, questionSetSchema, planSchema, briefSchema, confirmationSchema, progressSchema, resultGroupSchema, errorRecoverySchema]);
export type ConversationBlock = z.infer<typeof conversationBlockSchema>;

export class AgentProtocolError extends Error {
  readonly code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID";

  constructor(code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID") {
    super(code);
    this.name = "AgentProtocolError";
    this.code = code;
  }
}

function isObject(value: unknown): value is object {
  return Boolean(value) && typeof value === "object";
}

function isUnsafeString(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (lower.startsWith("data:") || lower.startsWith("blob:") || lower.includes("base64,")) return true;
  return /^https?:\/\//i.test(lower) && /[?&](x-amz-|signature|expires|token|sig|se|sv|st|sp)[^=]*=/i.test(lower);
}

function assertSafeValue(value: unknown, code: AgentProtocolError["code"], seen = new Set<object>()): void {
  if (typeof value === "string") {
    if (isUnsafeString(value)) throw new AgentProtocolError(code);
    return;
  }
  if (!isObject(value)) return;
  if (seen.has(value)) throw new AgentProtocolError(code);
  seen.add(value);
  const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
  if (ctor === "File" || ctor === "Blob" || ctor === "FileList") throw new AgentProtocolError(code);
  if (Array.isArray(value)) {
    for (const item of value) assertSafeValue(item, code, seen);
  } else {
    for (const [key, item] of Object.entries(value)) {
      if (/^(provider|credential|authorization|base64|secret|api[_-]?key|signed[_-]?url|preview[_-]?url|data[_-]?url)$/i.test(key)) throw new AgentProtocolError(code);
      assertSafeValue(item, code, seen);
    }
  }
}

export function normalizeAgentContextSnapshot(input: unknown): AgentContextSnapshot {
  try {
    assertSafeValue(input, "AGENT_CONTEXT_UNSAFE");
    const parsed = agentContextSnapshotSchema.parse(input);
    return {
      ...parsed,
      refs: parsed.refs.map((ref) => ({ ...ref })),
      skillIds: [...parsed.skillIds],
      appIds: [...parsed.appIds],
    };
  } catch (error) {
    if (error instanceof AgentProtocolError) throw error;
    throw new AgentProtocolError("AGENT_CONTEXT_UNSAFE");
  }
}

export function normalizeConversationBlocks(input: unknown): ConversationBlock[] {
  try {
    assertSafeValue(input, "AGENT_BLOCK_INVALID");
    if (!Array.isArray(input)) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
    return input.slice(0, AGENT_PROTOCOL_MAX_BLOCKS).map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
      const value = raw as Record<string, unknown>;
      const copy: Record<string, unknown> = { ...value };
      if (value.type === "question_set" && Array.isArray(value.questions)) copy.questions = value.questions.slice(0, AGENT_PROTOCOL_MAX_QUESTIONS);
      if (value.type === "result_group" && Array.isArray(value.results)) copy.results = value.results.slice(0, AGENT_PROTOCOL_MAX_RESULTS);
      const parsed = conversationBlockSchema.parse(copy);
      if (parsed.type === "plan" && parsed.deliverables.length === 0 && !parsed.summary) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
      return parsed;
    });
  } catch (error) {
    if (error instanceof AgentProtocolError) throw error;
    throw new AgentProtocolError("AGENT_BLOCK_INVALID");
  }
}

