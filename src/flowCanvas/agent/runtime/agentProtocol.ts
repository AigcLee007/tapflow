/**
 * The wire contract used by the canonical Agent runtime.
 *
 * This module intentionally does not contain provider or canvas implementation
 * details.  Values crossing the runtime boundary are normalized here so a
 * planner cannot persist URLs, credentials, or arbitrary LLM fields.
 */

export const AGENT_PROTOCOL_MAX_BLOCKS = 64;
export const AGENT_PROTOCOL_MAX_QUESTIONS = 4;
export const AGENT_PROTOCOL_MAX_RESULTS = 24;
export const AGENT_PROTOCOL_MAX_REFS = 64;
export const AGENT_PROTOCOL_TEXT_MAX = 4_000;
export const AGENT_PROTOCOL_ID_MAX = 200;
/** Backwards-compatible names used by runtime controllers. */
export const AGENT_PROTOCOL_MAX_TEXT = AGENT_PROTOCOL_TEXT_MAX;
export const AGENT_PROTOCOL_MAX_IDS = AGENT_PROTOCOL_MAX_REFS;

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

export type AgentExecutionState = "idle" | "queued" | "running" | "verifying" | "completed" | "failed" | "cancelled";

export type AgentContextRefRole = "subject" | "style" | "composition" | "layout" | "context";
/** Alias used by composer/reference UI code. */
export type AgentReferenceRole = AgentContextRefRole;
export type AgentContextRefSource = "canvas" | "asset" | "upload";
export type AgentReferenceSource = AgentContextRefSource;

export type AgentContextRef = {
  refId: string;
  source: AgentContextRefSource;
  nodeId?: string;
  assetId?: string;
  role?: AgentContextRefRole;
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

export type AgentQuestionKind = "text" | "single" | "multiple";
export type AgentQuestionOption = { id: string; label: string };
export type AgentQuestion = {
  id: string;
  prompt: string;
  kind: AgentQuestionKind;
  options?: AgentQuestionOption[];
  required?: boolean;
};

export type AgentDeliverableKind = "image" | "video" | "text";
export type AgentDeliverable = {
  id: string;
  label: string;
  kind: AgentDeliverableKind;
  quantity?: number;
};

export type AgentPlanBlock = {
  type: "plan";
  id?: string;
  title?: string;
  summary?: string;
  deliverables: AgentDeliverable[];
  capabilities?: string[];
  references?: string[];
  modelKey?: string | null;
  quantity?: number;
  estimatedCredits?: number;
  writes?: string[];
  requiresConfirmation?: boolean;
};

export type AgentBriefField = { key?: string; label: string; value: string; required?: boolean };
export type AgentBriefBlock = {
  type: "brief";
  id?: string;
  title?: string;
  fields: AgentBriefField[];
  editable?: boolean;
};

export type AgentConfirmationBlock = {
  type: "confirmation";
  id?: string;
  title?: string;
  text: string;
  risk?: string;
  costCredits?: number;
  quantity?: number;
  writes?: string[];
  confirmLabel?: string;
  reviseLabel?: string;
};

export type AgentProgressStepStatus = "pending" | "running" | "completed" | "failed";
export type AgentProgressStep = { id: string; label: string; status: AgentProgressStepStatus; detail?: string };
export type AgentProgressBlock = {
  type: "progress";
  id?: string;
  title?: string;
  steps: AgentProgressStep[];
};

export type AgentResultStatus = "pending" | "ready" | "selected" | "failed";
export type AgentResultRef = {
  id: string;
  label: string;
  kind?: AgentDeliverableKind;
  assetId?: string;
  refId?: string;
  runId?: string;
  status?: AgentResultStatus;
  sourceRefs?: string[];
};
export type AgentResultGroupBlock = {
  type: "result_group";
  id?: string;
  title?: string;
  results: AgentResultRef[];
};

export type AgentRecoveryAction = { id: string; label: string; action: "retry" | "revise" | "dismiss" };
export type AgentErrorRecoveryBlock = {
  type: "error_recovery";
  id?: string;
  title?: string;
  message: string;
  actions: AgentRecoveryAction[];
};

export type AgentUnderstandingBlock = { type: "understanding"; id?: string; title?: string; text: string };
export type AgentQuestionSetBlock = { type: "question_set"; id?: string; title?: string; questions: AgentQuestion[] };

export type ConversationBlock =
  | AgentUnderstandingBlock
  | AgentQuestionSetBlock
  | AgentPlanBlock
  | AgentBriefBlock
  | AgentConfirmationBlock
  | AgentProgressBlock
  | AgentResultGroupBlock
  | AgentErrorRecoveryBlock;

export class AgentProtocolError extends Error {
  readonly code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID";

  constructor(code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID", message = code) {
    super(message);
    this.name = "AgentProtocolError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isObjectLike(value: unknown): value is object {
  return Boolean(value) && typeof value === "object";
}

function isUnsafeString(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (lower.startsWith("data:") || lower.startsWith("blob:")) return true;
  if (lower.includes("base64,")) return true;
  if (/^https?:\/\//i.test(lower)) {
    // The canonical protocol has no URL fields.  Reject signed or tokenized
    // HTTP(S) values so a temporary preview can never become durable data.
    if (/[?&](x-amz-|signature|expires|token|sig|se|sv|st|sp)[^=]*=/i.test(lower)) return true;
  }
  return false;
}

function assertSafeValue(value: unknown, code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID", seen = new Set<object>()): void {
  if (typeof value === "string") {
    if (isUnsafeString(value)) throw new AgentProtocolError(code);
    return;
  }
  if (!isObjectLike(value)) return;
  if (seen.has(value)) throw new AgentProtocolError(code);
  seen.add(value);
  const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
  if (ctor === "File" || ctor === "Blob" || ctor === "FileList") throw new AgentProtocolError(code);
  if (typeof Blob !== "undefined" && value instanceof Blob) throw new AgentProtocolError(code);
  if (typeof File !== "undefined" && value instanceof File) throw new AgentProtocolError(code);
  if (Array.isArray(value)) {
    for (const item of value) assertSafeValue(item, code, seen);
  } else {
    for (const [key, item] of Object.entries(value)) {
      if (/^(provider|credential|authorization|base64|secret|api[_-]?key|signed[_-]?url|preview[_-]?url|data[_-]?url)$/i.test(key)) {
        throw new AgentProtocolError(code);
      }
      assertSafeValue(item, code, seen);
    }
  }
  seen.delete(value);
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID"): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) throw new AgentProtocolError(code);
}

function text(value: unknown, code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID", max = AGENT_PROTOCOL_TEXT_MAX): string {
  if (typeof value !== "string" || value.trim().length === 0 || isUnsafeString(value)) throw new AgentProtocolError(code);
  return value.trim().slice(0, max);
}

function optionalText(value: unknown, code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID", max = AGENT_PROTOCOL_TEXT_MAX): string | undefined {
  return value === undefined ? undefined : text(value, code, max);
}

function id(value: unknown, code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID"): string {
  return text(value, code, AGENT_PROTOCOL_ID_MAX);
}

function stringList(value: unknown, code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID", maxItems = AGENT_PROTOCOL_MAX_REFS): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new AgentProtocolError(code);
  return value.map((item) => id(item, code));
}

function optionalStringList(value: unknown, code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID", maxItems = AGENT_PROTOCOL_MAX_REFS): string[] | undefined {
  return value === undefined ? undefined : stringList(value, code, maxItems);
}

function finiteNumber(value: unknown, code: "AGENT_CONTEXT_UNSAFE" | "AGENT_BLOCK_INVALID", integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) throw new AgentProtocolError(code);
  return value;
}

export function normalizeAgentContextSnapshot(input: unknown): AgentContextSnapshot {
  try {
    assertSafeValue(input, "AGENT_CONTEXT_UNSAFE");
    if (!isRecord(input)) throw new AgentProtocolError("AGENT_CONTEXT_UNSAFE");
    assertKeys(input, ["projectId", "flowId", "graphRevision", "refs", "skillIds", "appIds", "modelKey"], "AGENT_CONTEXT_UNSAFE");
    const projectId = input.projectId === null ? null : id(input.projectId, "AGENT_CONTEXT_UNSAFE");
    const flowId = input.flowId === null ? null : id(input.flowId, "AGENT_CONTEXT_UNSAFE");
    const graphRevision = finiteNumber(input.graphRevision, "AGENT_CONTEXT_UNSAFE", true);
    if (!Array.isArray(input.refs) || input.refs.length > AGENT_PROTOCOL_MAX_REFS) throw new AgentProtocolError("AGENT_CONTEXT_UNSAFE");
    const refs = input.refs.map((raw): AgentContextRef => {
      if (!isRecord(raw)) throw new AgentProtocolError("AGENT_CONTEXT_UNSAFE");
      assertKeys(raw, ["refId", "source", "nodeId", "assetId", "role", "label"], "AGENT_CONTEXT_UNSAFE");
      if (raw.source !== "canvas" && raw.source !== "asset" && raw.source !== "upload") throw new AgentProtocolError("AGENT_CONTEXT_UNSAFE");
      if (raw.role !== undefined && !["subject", "style", "composition", "layout", "context"].includes(String(raw.role))) throw new AgentProtocolError("AGENT_CONTEXT_UNSAFE");
      const result: AgentContextRef = {
        refId: id(raw.refId, "AGENT_CONTEXT_UNSAFE"),
        source: raw.source,
        label: text(raw.label, "AGENT_CONTEXT_UNSAFE"),
      };
      if (raw.nodeId !== undefined) result.nodeId = id(raw.nodeId, "AGENT_CONTEXT_UNSAFE");
      if (raw.assetId !== undefined) result.assetId = id(raw.assetId, "AGENT_CONTEXT_UNSAFE");
      if (raw.role !== undefined) result.role = raw.role as AgentContextRefRole;
      return result;
    });
    const skillIds = stringList(input.skillIds, "AGENT_CONTEXT_UNSAFE");
    const appIds = stringList(input.appIds, "AGENT_CONTEXT_UNSAFE");
    const modelKey = input.modelKey === null ? null : id(input.modelKey, "AGENT_CONTEXT_UNSAFE");
    return { projectId, flowId, graphRevision, refs, skillIds, appIds, modelKey };
  } catch (error) {
    if (error instanceof AgentProtocolError) throw error;
    throw new AgentProtocolError("AGENT_CONTEXT_UNSAFE");
  }
}

function normalizeQuestion(raw: unknown): AgentQuestion {
  if (!isRecord(raw)) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
  assertKeys(raw, ["id", "prompt", "kind", "options", "required"], "AGENT_BLOCK_INVALID");
  if (!["text", "single", "multiple"].includes(String(raw.kind))) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
  const question: AgentQuestion = { id: id(raw.id, "AGENT_BLOCK_INVALID"), prompt: text(raw.prompt, "AGENT_BLOCK_INVALID"), kind: raw.kind as AgentQuestionKind };
  if (raw.required !== undefined) {
    if (typeof raw.required !== "boolean") throw new AgentProtocolError("AGENT_BLOCK_INVALID");
    question.required = raw.required;
  }
  if (raw.options !== undefined) {
    if (!Array.isArray(raw.options) || raw.options.length > 24) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
    question.options = raw.options.map((option): AgentQuestionOption => {
      if (!isRecord(option)) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
      assertKeys(option, ["id", "label"], "AGENT_BLOCK_INVALID");
      return { id: id(option.id, "AGENT_BLOCK_INVALID"), label: text(option.label, "AGENT_BLOCK_INVALID") };
    });
  }
  return question;
}

function normalizeResult(raw: unknown): AgentResultRef {
  if (!isRecord(raw)) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
  assertKeys(raw, ["id", "label", "kind", "assetId", "refId", "runId", "status", "sourceRefs"], "AGENT_BLOCK_INVALID");
  const result: AgentResultRef = { id: id(raw.id, "AGENT_BLOCK_INVALID"), label: text(raw.label, "AGENT_BLOCK_INVALID") };
  if (raw.kind !== undefined) {
    if (!["image", "video", "text"].includes(String(raw.kind))) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
    result.kind = raw.kind as AgentDeliverableKind;
  }
  for (const key of ["assetId", "refId", "runId"] as const) if (raw[key] !== undefined) result[key] = id(raw[key], "AGENT_BLOCK_INVALID");
  if (raw.status !== undefined) {
    if (!["pending", "ready", "selected", "failed"].includes(String(raw.status))) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
    result.status = raw.status as AgentResultStatus;
  }
  if (raw.sourceRefs !== undefined) result.sourceRefs = stringList(raw.sourceRefs, "AGENT_BLOCK_INVALID", 24);
  return result;
}

function normalizeBlock(raw: unknown): ConversationBlock {
  if (!isRecord(raw) || typeof raw.type !== "string") throw new AgentProtocolError("AGENT_BLOCK_INVALID");
  const common = ["type", "id", "title"] as const;
  const optionalCommon = (value: Record<string, unknown>) => ({
    ...(value.id !== undefined ? { id: id(value.id, "AGENT_BLOCK_INVALID") } : {}),
    ...(value.title !== undefined ? { title: text(value.title, "AGENT_BLOCK_INVALID") } : {}),
  });
  switch (raw.type) {
    case "understanding":
      assertKeys(raw, [...common, "text"], "AGENT_BLOCK_INVALID");
      return { type: "understanding", ...optionalCommon(raw), text: text(raw.text, "AGENT_BLOCK_INVALID") };
    case "question_set":
      assertKeys(raw, [...common, "questions"], "AGENT_BLOCK_INVALID");
      if (!Array.isArray(raw.questions)) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
      return { type: "question_set", ...optionalCommon(raw), questions: raw.questions.slice(0, AGENT_PROTOCOL_MAX_QUESTIONS).map(normalizeQuestion) };
    case "plan": {
      assertKeys(raw, [...common, "summary", "deliverables", "capabilities", "references", "modelKey", "quantity", "estimatedCredits", "writes", "requiresConfirmation"], "AGENT_BLOCK_INVALID");
      if (raw.summary === undefined && raw.deliverables === undefined) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
      if (raw.deliverables !== undefined && (!Array.isArray(raw.deliverables) || raw.deliverables.length > 24)) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
      const rawDeliverables = Array.isArray(raw.deliverables) ? raw.deliverables : [];
      const deliverables = rawDeliverables.map((item): AgentDeliverable => {
        if (!isRecord(item)) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
        assertKeys(item, ["id", "label", "kind", "quantity"], "AGENT_BLOCK_INVALID");
        if (!["image", "video", "text"].includes(String(item.kind))) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
        const output: AgentDeliverable = { id: id(item.id, "AGENT_BLOCK_INVALID"), label: text(item.label, "AGENT_BLOCK_INVALID"), kind: item.kind as AgentDeliverableKind };
        if (item.quantity !== undefined) output.quantity = finiteNumber(item.quantity, "AGENT_BLOCK_INVALID", true);
        return output;
      });
      const block: AgentPlanBlock = { type: "plan", ...optionalCommon(raw), deliverables };
      if (raw.summary !== undefined) block.summary = text(raw.summary, "AGENT_BLOCK_INVALID");
      if (raw.capabilities !== undefined) block.capabilities = stringList(raw.capabilities, "AGENT_BLOCK_INVALID", 24);
      if (raw.references !== undefined) block.references = stringList(raw.references, "AGENT_BLOCK_INVALID", 24);
      if (raw.modelKey !== undefined) block.modelKey = raw.modelKey === null ? null : id(raw.modelKey, "AGENT_BLOCK_INVALID");
      for (const key of ["quantity", "estimatedCredits"] as const) if (raw[key] !== undefined) block[key] = finiteNumber(raw[key], "AGENT_BLOCK_INVALID", key === "quantity");
      if (raw.writes !== undefined) block.writes = stringList(raw.writes, "AGENT_BLOCK_INVALID", 24);
      if (raw.requiresConfirmation !== undefined) {
        if (typeof raw.requiresConfirmation !== "boolean") throw new AgentProtocolError("AGENT_BLOCK_INVALID");
        block.requiresConfirmation = raw.requiresConfirmation;
      }
      return block;
    }
    case "brief": {
      assertKeys(raw, [...common, "fields", "editable"], "AGENT_BLOCK_INVALID");
      if (!Array.isArray(raw.fields) || raw.fields.length > 64) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
      const fields = raw.fields.map((item): AgentBriefField => {
        if (!isRecord(item)) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
        assertKeys(item, ["key", "label", "value", "required"], "AGENT_BLOCK_INVALID");
        const field: AgentBriefField = { label: text(item.label, "AGENT_BLOCK_INVALID"), value: text(item.value, "AGENT_BLOCK_INVALID") };
        if (item.key !== undefined) field.key = id(item.key, "AGENT_BLOCK_INVALID");
        if (item.required !== undefined) {
          if (typeof item.required !== "boolean") throw new AgentProtocolError("AGENT_BLOCK_INVALID");
          field.required = item.required;
        }
        return field;
      });
      const block: AgentBriefBlock = { type: "brief", ...optionalCommon(raw), fields };
      if (raw.editable !== undefined) {
        if (typeof raw.editable !== "boolean") throw new AgentProtocolError("AGENT_BLOCK_INVALID");
        block.editable = raw.editable;
      }
      return block;
    }
    case "confirmation": {
      assertKeys(raw, [...common, "text", "risk", "costCredits", "quantity", "writes", "confirmLabel", "reviseLabel"], "AGENT_BLOCK_INVALID");
      const block: AgentConfirmationBlock = { type: "confirmation", ...optionalCommon(raw), text: text(raw.text, "AGENT_BLOCK_INVALID") };
      if (raw.risk !== undefined) block.risk = text(raw.risk, "AGENT_BLOCK_INVALID");
      for (const key of ["costCredits", "quantity"] as const) if (raw[key] !== undefined) block[key] = finiteNumber(raw[key], "AGENT_BLOCK_INVALID", key === "quantity");
      if (raw.writes !== undefined) block.writes = stringList(raw.writes, "AGENT_BLOCK_INVALID", 24);
      if (raw.confirmLabel !== undefined) block.confirmLabel = text(raw.confirmLabel, "AGENT_BLOCK_INVALID", 120);
      if (raw.reviseLabel !== undefined) block.reviseLabel = text(raw.reviseLabel, "AGENT_BLOCK_INVALID", 120);
      return block;
    }
    case "progress": {
      assertKeys(raw, [...common, "steps"], "AGENT_BLOCK_INVALID");
      if (!Array.isArray(raw.steps) || raw.steps.length > 64) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
      const steps = raw.steps.map((item): AgentProgressStep => {
        if (!isRecord(item)) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
        assertKeys(item, ["id", "label", "status", "detail"], "AGENT_BLOCK_INVALID");
        if (!["pending", "running", "completed", "failed"].includes(String(item.status))) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
        return { id: id(item.id, "AGENT_BLOCK_INVALID"), label: text(item.label, "AGENT_BLOCK_INVALID"), status: item.status as AgentProgressStepStatus, ...(item.detail !== undefined ? { detail: text(item.detail, "AGENT_BLOCK_INVALID") } : {}) };
      });
      return { type: "progress", ...optionalCommon(raw), steps };
    }
    case "result_group":
      assertKeys(raw, [...common, "results"], "AGENT_BLOCK_INVALID");
      if (!Array.isArray(raw.results)) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
      return { type: "result_group", ...optionalCommon(raw), results: raw.results.slice(0, AGENT_PROTOCOL_MAX_RESULTS).map(normalizeResult) };
    case "error_recovery": {
      assertKeys(raw, [...common, "message", "actions"], "AGENT_BLOCK_INVALID");
      if (!Array.isArray(raw.actions) || raw.actions.length > 24) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
      const actions = raw.actions.map((item): AgentRecoveryAction => {
        if (!isRecord(item)) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
        assertKeys(item, ["id", "label", "action"], "AGENT_BLOCK_INVALID");
        if (!["retry", "revise", "dismiss"].includes(String(item.action))) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
        return { id: id(item.id, "AGENT_BLOCK_INVALID"), label: text(item.label, "AGENT_BLOCK_INVALID"), action: item.action as AgentRecoveryAction["action"] };
      });
      return { type: "error_recovery", ...optionalCommon(raw), message: text(raw.message, "AGENT_BLOCK_INVALID"), actions };
    }
    default:
      throw new AgentProtocolError("AGENT_BLOCK_INVALID");
  }
}

export function normalizeConversationBlocks(input: unknown): ConversationBlock[] {
  try {
    assertSafeValue(input, "AGENT_BLOCK_INVALID");
    if (!Array.isArray(input)) throw new AgentProtocolError("AGENT_BLOCK_INVALID");
    return input.slice(0, AGENT_PROTOCOL_MAX_BLOCKS).map(normalizeBlock);
  } catch (error) {
    if (error instanceof AgentProtocolError) throw error;
    throw new AgentProtocolError("AGENT_BLOCK_INVALID");
  }
}
