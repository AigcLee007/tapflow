/**
 * Canonical, provider-neutral contracts shared by the Agent workspace.
 *
 * This module is deliberately defensive. Values crossing the Agent boundary
 * are identifiers and presentation data only; provider credentials, URLs and
 * browser objects never become part of the protocol.
 */

export type AgentPhase =
  | "idle"
  | "understanding"
  | "waiting_for_input"
  | "planning"
  | "waiting_for_confirmation"
  | "executing"
  | "verifying"
  | "presenting_results"
  | "refining"
  | "failed"
  | "cancelled";

export type AgentExecutionState =
  | "idle"
  | "queued"
  | "running"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentReferenceRole = "subject" | "style" | "composition" | "layout" | "context";
export type AgentReferenceSource = "canvas" | "asset" | "upload";

export type AgentContextRef = {
  refId: string;
  source: AgentReferenceSource;
  nodeId?: string;
  assetId?: string;
  role?: AgentReferenceRole;
  label: string;
};

export type AgentContextSnapshot = {
  projectId: string | null;
  flowId: string | null;
  graphRevision: number;
  refs: AgentContextRef[];
  skillIds: string[];
  appIds: string[];
  modelKey: string | null;
};

export type AgentDecisionType =
  | "answer_question"
  | "edit_brief"
  | "approve_plan"
  | "revise_plan"
  | "result_action"
  | "cancel_execution"
  | "retry_execution";

export type AgentDecision = {
  type: AgentDecisionType;
  decisionId: string;
  sessionId: string;
  turnId: string;
  graphRevision: number;
  idempotencyKey: string;
  answer?: Record<string, unknown>;
  field?: string;
  value?: string;
  action?: string;
  resultId?: string;
};

export type AgentQuestion = {
  id: string;
  prompt: string;
  kind?: "text" | "single" | "multiple";
  options?: string[];
  required?: boolean;
  placeholder?: string;
};

export type AgentPlan = {
  title?: string;
  summary?: string;
  deliverables?: string[];
  modelKey?: string | null;
  quantity?: number;
  estimatedCredits?: number;
  writesCanvas?: boolean;
  capabilities?: string[];
};

export type AgentBriefField = { key: string; label: string; value: string };
export type AgentProgressStep = { id: string; label: string; status: "pending" | "running" | "completed" | "failed"; detail?: string };
export type AgentResultRef = {
  id: string;
  label: string;
  kind?: "image" | "video" | "text" | "audio" | "other";
  assetId?: string;
  contentText?: string;
  status?: "ready" | "selected" | "failed";
  sourceRefs?: string[];
  placedNodeId?: string;
};

export type ConversationBlock =
  | { type: "understanding"; id?: string; title?: string; text: string }
  | { type: "question_set"; id?: string; title?: string; questions: AgentQuestion[] }
  | { type: "plan"; id?: string; title?: string; summary?: string; plan: AgentPlan }
  | { type: "brief"; id?: string; title?: string; text?: string; fields: AgentBriefField[] }
  | { type: "confirmation"; id?: string; title?: string; text: string; risk?: string; estimatedCredits?: number; quantity?: number; writesCanvas?: boolean }
  | { type: "progress"; id?: string; title?: string; steps: AgentProgressStep[] }
  | { type: "result_group"; id?: string; title?: string; results: AgentResultRef[] }
  | { type: "error_recovery"; id?: string; title?: string; text: string; retryable?: boolean; refundStatus?: "pending" | "released" | "refunded" | "not_applicable" };

export const AGENT_PROTOCOL_MAX_BLOCKS = 64;
export const AGENT_PROTOCOL_MAX_QUESTIONS = 4;
export const AGENT_PROTOCOL_MAX_RESULTS = 24;
export const AGENT_PROTOCOL_MAX_TEXT = 4_000;
export const AGENT_PROTOCOL_MAX_REFS = 64;
export const AGENT_PROTOCOL_MAX_IDS = 64;

export class AgentProtocolError extends Error {
  readonly code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID";

  constructor(code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID", message = code) {
    super(message === code ? code : `${code}: ${message}`);
    this.name = "AgentProtocolError";
    this.code = code;
  }
}

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasBrowserObject = (value: unknown) => {
  if (typeof File !== "undefined" && value instanceof File) return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  return false;
};

const unsafeKey = (key: string) => {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized === "provider"
    || normalized === "credential"
    || normalized === "credentials"
    || normalized === "authorization"
    || normalized === "apikey"
    || normalized === "apisecret"
    || normalized === "secret"
    || normalized === "token"
    || normalized === "base64"
    || normalized === "blob"
    || normalized === "data"
    || normalized === "signedurl";
};

const unsafeString = (value: string) => /^(?:data:|blob:)/i.test(value)
  || /^https?:\/\//i.test(value)
  || /(?:^|[^a-z])base64(?:$|[^a-z])/i.test(value)
  || /(?:authorization\s*:|\b(?:bearer|basic)\s+)/i.test(value)
  || /(?:x-amz-signature|x-amz-credential|signature=|expires=|token=)/i.test(value);

function failContext(message = "unsafe context snapshot") : never {
  throw new AgentProtocolError("AGENT_CONTEXT_UNSAFE", message);
}

function failBlock(message = "invalid conversation block") : never {
  throw new AgentProtocolError("AGENT_BLOCK_INVALID", message);
}

function requiredString(value: unknown, code: "context" | "block", name: string, max = AGENT_PROTOCOL_MAX_TEXT): string {
  if (typeof value !== "string" || !value.trim() || unsafeString(value)) {
    return code === "context" ? failContext(`invalid ${name}`) : failBlock(`invalid ${name}`);
  }
  return value.slice(0, max);
}

function optionalString(value: unknown, code: "context" | "block", name: string, max = AGENT_PROTOCOL_MAX_TEXT): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, code, name, max);
}

function ensurePlainRecord(value: unknown, code: "context" | "block"): RecordValue {
  if (!isRecord(value) || hasBrowserObject(value)) return code === "context" ? failContext() : failBlock();
  return value;
}

function ensureKeys(value: RecordValue, allowed: readonly string[], code: "context" | "block") {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key) || unsafeKey(key)) code === "context" ? failContext(`unsupported context field: ${key}`) : failBlock(`unsupported block field: ${key}`);
  }
}

function safeIdList(value: unknown, code: "context" | "block", name: string): string[] {
  if (!Array.isArray(value)) return code === "context" ? failContext(`invalid ${name}`) : failBlock(`invalid ${name}`);
  const values: string[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, AGENT_PROTOCOL_MAX_IDS)) {
    const id = requiredString(item, code, name, 200);
    if (!seen.has(id)) {
      seen.add(id);
      values.push(id);
    }
  }
  return values;
}

export function normalizeAgentContextSnapshot(input: unknown): AgentContextSnapshot {
  const value = ensurePlainRecord(input, "context");
  ensureKeys(value, ["projectId", "flowId", "graphRevision", "refs", "skillIds", "appIds", "modelKey"], "context");
  if (!Number.isSafeInteger(value.graphRevision) || (value.graphRevision as number) < 0) return failContext("invalid graphRevision");
  const refsInput = value.refs;
  if (!Array.isArray(refsInput)) return failContext("refs must be an array");
  const refs: AgentContextRef[] = [];
  const seen = new Set<string>();
  for (const item of refsInput.slice(0, AGENT_PROTOCOL_MAX_REFS)) {
    const ref = ensurePlainRecord(item, "context");
    ensureKeys(ref, ["refId", "source", "nodeId", "assetId", "role", "label"], "context");
    const refId = requiredString(ref.refId, "context", "refId", 200);
    if (seen.has(refId)) continue;
    const source = ref.source;
    if (source !== "canvas" && source !== "asset" && source !== "upload") return failContext("invalid ref source");
    const role = ref.role;
    if (role !== undefined && !["subject", "style", "composition", "layout", "context"].includes(role as string)) return failContext("invalid ref role");
    const label = requiredString(ref.label, "context", "label");
    const nodeId = optionalString(ref.nodeId, "context", "nodeId", 200);
    const assetId = optionalString(ref.assetId, "context", "assetId", 200);
    refs.push({ refId, source, ...(nodeId ? { nodeId } : {}), ...(assetId ? { assetId } : {}), ...(role ? { role } : {}), label });
    seen.add(refId);
  }
  const nullableId = (candidate: unknown, name: string) => candidate === null ? null : requiredString(candidate, "context", name, 200);
  return {
    projectId: nullableId(value.projectId, "projectId"),
    flowId: nullableId(value.flowId, "flowId"),
    graphRevision: value.graphRevision as number,
    refs,
    skillIds: safeIdList(value.skillIds, "context", "skillIds"),
    appIds: safeIdList(value.appIds, "context", "appIds"),
    modelKey: nullableId(value.modelKey, "modelKey"),
  };
}

function normalizeQuestion(value: unknown): AgentQuestion {
  const question = ensurePlainRecord(value, "block");
  ensureKeys(question, ["id", "prompt", "kind", "options", "required", "placeholder"], "block");
  const kind = question.kind;
  if (kind !== undefined && kind !== "text" && kind !== "single" && kind !== "multiple") return failBlock("invalid question kind");
  let options: string[] | undefined;
  if (question.options !== undefined) options = safeIdList(question.options, "block", "question options").map((item) => item.slice(0, AGENT_PROTOCOL_MAX_TEXT));
  if (question.required !== undefined && typeof question.required !== "boolean") return failBlock("invalid question required flag");
  return { id: requiredString(question.id, "block", "question id", 200), prompt: requiredString(question.prompt, "block", "question prompt"), ...(kind ? { kind } : {}), ...(options?.length ? { options } : {}), ...(question.required === undefined ? {} : { required: question.required }), ...(question.placeholder === undefined ? {} : { placeholder: requiredString(question.placeholder, "block", "question placeholder") }) };
}

function normalizePlan(value: unknown): AgentPlan {
  const plan = ensurePlainRecord(value, "block");
  ensureKeys(plan, ["title", "summary", "deliverables", "modelKey", "quantity", "estimatedCredits", "writesCanvas", "capabilities"], "block");
  const result: AgentPlan = {};
  if (plan.title !== undefined) result.title = requiredString(plan.title, "block", "plan title");
  if (plan.summary !== undefined) result.summary = requiredString(plan.summary, "block", "plan summary");
  if (plan.deliverables !== undefined) result.deliverables = safeIdList(plan.deliverables, "block", "deliverables");
  if (plan.modelKey !== undefined) result.modelKey = plan.modelKey === null ? null : requiredString(plan.modelKey, "block", "plan modelKey", 200);
  if (plan.quantity !== undefined) {
    if (!Number.isSafeInteger(plan.quantity) || (plan.quantity as number) < 1) return failBlock("invalid plan quantity");
    result.quantity = plan.quantity as number;
  }
  if (plan.estimatedCredits !== undefined) {
    if (typeof plan.estimatedCredits !== "number" || !Number.isFinite(plan.estimatedCredits) || plan.estimatedCredits < 0) return failBlock("invalid plan estimatedCredits");
    result.estimatedCredits = plan.estimatedCredits;
  }
  if (plan.writesCanvas !== undefined) {
    if (typeof plan.writesCanvas !== "boolean") return failBlock("invalid plan writesCanvas");
    result.writesCanvas = plan.writesCanvas;
  }
  if (plan.capabilities !== undefined) result.capabilities = safeIdList(plan.capabilities, "block", "capabilities");
  return result;
}

function normalizeBlock(value: unknown): ConversationBlock {
  const raw = ensurePlainRecord(value, "block");
  if (typeof raw.type !== "string") return failBlock("block type is required");
  const common = (allowed: readonly string[]) => {
    ensureKeys(raw, allowed, "block");
    const id = optionalString(raw.id, "block", "block id", 200);
    const title = optionalString(raw.title, "block", "block title");
    return { ...(id ? { id } : {}), ...(title ? { title } : {}) };
  };
  if (raw.type === "understanding") {
    return { type: raw.type, ...common(["type", "id", "title", "text"]), text: requiredString(raw.text, "block", "understanding text") };
  }
  if (raw.type === "question_set") {
    const base = common(["type", "id", "title", "questions"]);
    if (!Array.isArray(raw.questions)) return failBlock("question_set questions are required");
    return { type: raw.type, ...base, questions: raw.questions.slice(0, AGENT_PROTOCOL_MAX_QUESTIONS).map(normalizeQuestion) };
  }
  if (raw.type === "plan") {
    const base = common(["type", "id", "title", "summary", "plan", "deliverables", "modelKey", "quantity", "estimatedCredits", "writesCanvas", "capabilities"]);
    const planValue = raw.plan ?? { summary: raw.summary, deliverables: raw.deliverables, modelKey: raw.modelKey, quantity: raw.quantity, estimatedCredits: raw.estimatedCredits, writesCanvas: raw.writesCanvas, capabilities: raw.capabilities, ...(raw.title ? { title: raw.title } : {}) };
    const plan = normalizePlan(planValue);
    return { type: raw.type, ...base, ...(raw.summary === undefined && plan.summary ? { summary: plan.summary } : {}), plan };
  }
  if (raw.type === "brief") {
    const base = common(["type", "id", "title", "text", "fields"]);
    if (!Array.isArray(raw.fields)) return failBlock("brief fields are required");
    const fields = raw.fields.slice(0, AGENT_PROTOCOL_MAX_QUESTIONS).map((field) => {
      const item = ensurePlainRecord(field, "block");
      ensureKeys(item, ["key", "label", "value"], "block");
      return { key: requiredString(item.key, "block", "brief key", 200), label: requiredString(item.label, "block", "brief label"), value: requiredString(item.value, "block", "brief value") };
    });
    return { type: raw.type, ...base, ...(raw.text === undefined ? {} : { text: requiredString(raw.text, "block", "brief text") }), fields };
  }
  if (raw.type === "confirmation") {
    const base = common(["type", "id", "title", "text", "risk", "estimatedCredits", "quantity", "writesCanvas"]);
    if (raw.estimatedCredits !== undefined && (typeof raw.estimatedCredits !== "number" || !Number.isFinite(raw.estimatedCredits) || raw.estimatedCredits < 0)) return failBlock("invalid confirmation estimatedCredits");
    if (raw.quantity !== undefined && (!Number.isSafeInteger(raw.quantity) || (raw.quantity as number) < 1)) return failBlock("invalid confirmation quantity");
    if (raw.writesCanvas !== undefined && typeof raw.writesCanvas !== "boolean") return failBlock("invalid confirmation writesCanvas");
    return { type: raw.type, ...base, text: requiredString(raw.text, "block", "confirmation text"), ...(raw.risk === undefined ? {} : { risk: requiredString(raw.risk, "block", "confirmation risk") }), ...(raw.estimatedCredits === undefined ? {} : { estimatedCredits: raw.estimatedCredits as number }), ...(raw.quantity === undefined ? {} : { quantity: raw.quantity as number }), ...(raw.writesCanvas === undefined ? {} : { writesCanvas: raw.writesCanvas as boolean }) };
  }
  if (raw.type === "progress") {
    const base = common(["type", "id", "title", "steps"]);
    if (!Array.isArray(raw.steps)) return failBlock("progress steps are required");
    const steps = raw.steps.slice(0, AGENT_PROTOCOL_MAX_RESULTS).map((step) => {
      const item = ensurePlainRecord(step, "block");
      ensureKeys(item, ["id", "label", "status", "detail"], "block");
      if (!["pending", "running", "completed", "failed"].includes(item.status as string)) return failBlock("invalid progress status");
      return { id: requiredString(item.id, "block", "progress id", 200), label: requiredString(item.label, "block", "progress label"), status: item.status as AgentProgressStep["status"], ...(item.detail === undefined ? {} : { detail: requiredString(item.detail, "block", "progress detail") }) };
    });
    return { type: raw.type, ...base, steps };
  }
  if (raw.type === "result_group") {
    const base = common(["type", "id", "title", "results"]);
    if (!Array.isArray(raw.results)) return failBlock("result_group results are required");
    const results = raw.results.slice(0, AGENT_PROTOCOL_MAX_RESULTS).map((result) => {
      const item = ensurePlainRecord(result, "block");
      ensureKeys(item, ["id", "label", "kind", "assetId", "contentText", "status", "sourceRefs", "placedNodeId"], "block");
      if (item.kind !== undefined && !["image", "video", "text", "audio", "other"].includes(item.kind as string)) return failBlock("invalid result kind");
      if (item.status !== undefined && !["ready", "selected", "failed"].includes(item.status as string)) return failBlock("invalid result status");
      return { id: requiredString(item.id, "block", "result id", 200), label: requiredString(item.label, "block", "result label"), ...(item.kind === undefined ? {} : { kind: item.kind as AgentResultRef["kind"] }), ...(item.assetId === undefined ? {} : { assetId: requiredString(item.assetId, "block", "result assetId", 200) }), ...(item.contentText === undefined ? {} : { contentText: requiredString(item.contentText, "block", "result contentText") }), ...(item.status === undefined ? {} : { status: item.status as AgentResultRef["status"] }), ...(item.sourceRefs === undefined ? {} : { sourceRefs: safeIdList(item.sourceRefs, "block", "result sourceRefs") }), ...(item.placedNodeId === undefined ? {} : { placedNodeId: requiredString(item.placedNodeId, "block", "placedNodeId", 200) }) };
    });
    return { type: raw.type, ...base, results };
  }
  if (raw.type === "error_recovery") {
    const base = common(["type", "id", "title", "text", "retryable", "refundStatus"]);
    if (raw.retryable !== undefined && typeof raw.retryable !== "boolean") return failBlock("invalid retryable flag");
    if (raw.refundStatus !== undefined && !["pending", "released", "refunded", "not_applicable"].includes(raw.refundStatus as string)) return failBlock("invalid refund status");
    return { type: raw.type, ...base, text: requiredString(raw.text, "block", "error text"), ...(raw.retryable === undefined ? {} : { retryable: raw.retryable as boolean }), ...(raw.refundStatus === undefined ? {} : { refundStatus: raw.refundStatus as "pending" | "released" | "refunded" | "not_applicable" }) };
  }
  return failBlock(`unsupported block type: ${raw.type}`);
}

export function normalizeConversationBlocks(input: unknown): ConversationBlock[] {
  if (!Array.isArray(input)) return failBlock("blocks must be an array");
  return input.slice(0, AGENT_PROTOCOL_MAX_BLOCKS).map(normalizeBlock);
}

export const normalizeAgentBlocks = normalizeConversationBlocks;
