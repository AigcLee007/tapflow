import type {
  AgentDecision,
  AgentExecutionMode,
  AgentV6Phase,
  ConfirmationPlan,
  ConversationState,
} from "./conversationTypes";

export type ConversationEvent =
  | { type: "turn_submitted"; prompt: string }
  | { type: "choice_requested"; id: string }
  | { type: "choice_submitted"; id?: string; optionIds: string[] }
  | { type: "brief_started" }
  | { type: "brief_ready"; plan?: ConfirmationPlan; payload?: Record<string, unknown>; decisionId?: string; graphRevision: number }
  | { type: "confirmation_granted"; decisionId: string; graphRevision: number; plan?: ConfirmationPlan }
  | { type: "execution_started" }
  | { type: "verification_started" }
  | { type: "results_presented" }
  | { type: "refinement_requested"; resultId?: string }
  | { type: "turn_failed"; error?: string }
  | { type: "retry" }
  | { type: "revise" }
  | { type: "recover" }
  | { type: "mode_changed"; mode: AgentExecutionMode }
  | { type: "reset" };

const EMPTY_CONTEXT = {
  projectId: null,
  flowId: null,
  selectedNodeIds: [],
  assetRefs: [],
  uploadedAssetIds: [],
  skillRefs: [],
  appRefs: [],
  modelKey: null,
  graphRevision: 0,
} as const;

export function initialConversationState(overrides: Partial<ConversationState> = {}): ConversationState {
  const graphRevision = isValidGraphRevision(overrides.graphRevision) ? overrides.graphRevision : 0;
  const context = { ...normalizeContext(overrides.contextSnapshot), graphRevision };
  return {
    phase: "idle",
    executionState: "idle",
    mode: "manual_confirmation",
    prompt: null,
    pendingQuestionId: null,
    pendingDecision: null,
    confirmed: false,
    blocks: [],
    progress: [],
    results: [],
    refiningResultId: null,
    error: null,
    ...overrides,
    graphRevision,
    plan: normalizePlan(overrides.plan ?? undefined),
    contextSnapshot: context,
  };
}

function boundedText(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function boundedId(value: unknown) {
  return boundedText(value, 200);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValidGraphRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function normalizeContext(context: ConversationState["contextSnapshot"] | undefined): ConversationState["contextSnapshot"] {
  const source = isPlainObject(context) ? context : EMPTY_CONTEXT;
  const strings = (value: unknown, limit: number) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, limit).map((item) => boundedText(item, 200)) : [];
  const assetRefs = Array.isArray(source.assetRefs) ? source.assetRefs.flatMap((value) => {
    if (!isPlainObject(value) || typeof value.assetId !== "string" || typeof value.refId !== "string" || typeof value.label !== "string") return [];
    return [{ assetId: boundedId(value.assetId), refId: boundedId(value.refId), label: boundedText(value.label, 400), ...(typeof value.nodeId === "string" ? { nodeId: boundedId(value.nodeId) } : {}) }];
  }).slice(0, 12) : [];
  const skillRefs = Array.isArray(source.skillRefs) ? source.skillRefs.flatMap((value) => {
    if (!isPlainObject(value) || typeof value.id !== "string") return [];
    return [{ id: boundedId(value.id), version: typeof value.version === "number" && Number.isFinite(value.version) && value.version >= 0 ? value.version : 0 }];
  }).slice(0, 12) : [];
  return {
    projectId: typeof source.projectId === "string" ? boundedId(source.projectId) : null,
    flowId: typeof source.flowId === "string" ? boundedId(source.flowId) : null,
    selectedNodeIds: strings(source.selectedNodeIds, 12),
    assetRefs,
    uploadedAssetIds: strings(source.uploadedAssetIds, 12),
    skillRefs,
    appRefs: strings(source.appRefs, 12),
    modelKey: typeof source.modelKey === "string" ? boundedId(source.modelKey) : null,
    graphRevision: isValidGraphRevision(source.graphRevision) ? source.graphRevision : 0,
  };
}

function normalizePlan(plan: ConfirmationPlan | undefined): ConfirmationPlan {
  if (!plan) return {};
  return {
    ...(typeof plan.title === "string" ? { title: boundedText(plan.title, 400) } : {}),
    ...(typeof plan.summary === "string" ? { summary: boundedText(plan.summary, 4_000) } : {}),
    ...(typeof plan.costCredits === "number" && Number.isFinite(plan.costCredits) ? { costCredits: Math.max(0, plan.costCredits) } : {}),
    ...(plan.batch === true ? { batch: true } : {}),
    ...(plan.writesCanvas === true ? { writesCanvas: true } : {}),
    ...(plan.skill === true ? { skill: true } : {}),
    ...(plan.app === true ? { app: true } : {}),
  };
}

const SAFE_PAYLOAD_KEYS = new Set(["prompt", "text", "value", "field", "optionIds", "resultId", "assetId", "assetIds", "nodeId", "nodeIds", "modelKey", "skillId", "appId", "mode", "fields", "options", "parameters", "referenceIds"]);
const SENSITIVE_PAYLOAD_KEYS = new Set(["provider", "route", "credential", "credentialid", "apikey", "baseurl", "signedurl", "authorization", "token", "secret", "password", "nonce", "authtag", "data", "blob", "html", "base64"]);

function normalizePayloadKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveString(value: string) {
  if (/^(?:data:|blob:)/i.test(value)) return true;
  if (/(?:authorization\s*:\s*|\b(?:bearer|basic)\s+)\S+/i.test(value)) return true;
  if (/^ey[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+$/i.test(value)) return true;
  if (/^(?:sk-|rk-|gh[pousr]_|xox[baprs]-|AIza)/i.test(value)) return true;
  return value.length >= 64 && /^[a-z0-9+/=_-]+$/i.test(value) && (/[+/=_-]/.test(value) || value.length >= 128);
}

function sanitizePayloadValue(value: unknown, strict: boolean, root: boolean, seen: Set<object>): unknown | null {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string" && isSensitiveString(value)) return null;
    return value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => sanitizePayloadValue(item, strict, false, seen));
    return result.every((item) => item !== null) ? result : null;
  }
  if (!isPlainObject(value)) return null;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = normalizePayloadKey(key);
    const allowed = !SENSITIVE_PAYLOAD_KEYS.has(normalizedKey) && (!root || SAFE_PAYLOAD_KEYS.has(key));
    if (!allowed) {
      if (strict) return null;
      continue;
    }
    const sanitized = sanitizePayloadValue(item, strict, false, seen);
    if (sanitized === null) {
      if (strict) return null;
      continue;
    }
    result[key] = sanitized;
  }
  return result;
}

function stableSerialize(value: unknown): string | null {
  try {
    if (!isPlainObject(value)) return null;
    const normalized = sanitizePayloadValue(value, true, true, new Set());
    if (!normalized || !isPlainObject(normalized)) return null;
    const sort = (item: unknown): unknown => {
      if (Array.isArray(item)) return item.map(sort);
      if (isPlainObject(item)) return Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])]));
      return item;
    };
    const serialized = JSON.stringify(sort(normalized));
    return typeof serialized === "string" && serialized.length <= 4_000 ? serialized : null;
  } catch {
    return null;
  }
}

function normalizeApprovedPayload(payload: Record<string, unknown> | undefined): Record<string, unknown> {
  const normalized = sanitizePayloadValue(payload ?? {}, false, true, new Set());
  return isPlainObject(normalized) ? normalized : {};
}

function decisionIdFor(state: ConversationState, decisionId?: string) {
  const supplied = boundedId(decisionId).trim();
  return supplied || boundedId(`decision:${boundedId(state.sessionId) || "session"}:${boundedId(state.turnId) || "turn"}:${state.graphRevision}`);
}

function pendingDecision(state: ConversationState, decisionId?: string, graphRevision = state.graphRevision, payload?: Record<string, unknown>): AgentDecision {
  const stableId = decisionIdFor(state, decisionId);
  return { type: "execute", decisionId: stableId, sessionId: boundedId(state.sessionId) || "session", turnId: boundedId(state.turnId) || "turn", graphRevision, payload: normalizeApprovedPayload(payload), idempotencyKey: stableId };
}

function isSafeDecision(decision: AgentDecision) {
  return decision.sessionId.length <= 200 && decision.turnId.length <= 200 && decision.idempotencyKey.length <= 200 && decision.decisionId.length <= 200 && isValidGraphRevision(decision.graphRevision) && stableSerialize(decision.payload) !== null && (decision.costCredits === undefined || (Number.isFinite(decision.costCredits) && decision.costCredits >= 0));
}

function planMatches(left: ConfirmationPlan | null, right: ConfirmationPlan | undefined) {
  if (!right) return true;
  return JSON.stringify(normalizePlan(left ?? {})) === JSON.stringify(normalizePlan(right));
}

function briefReadyState(state: ConversationState, event: Extract<ConversationEvent, { type: "brief_ready" }>): ConversationState {
  if (!isValidGraphRevision(event.graphRevision)) return state;
  const next = { ...state, graphRevision: event.graphRevision, contextSnapshot: { ...state.contextSnapshot, graphRevision: event.graphRevision }, phase: "waiting_for_confirmation" as const, plan: normalizePlan(event.plan), confirmed: false };
  return { ...next, pendingDecision: pendingDecision(next, event.decisionId, event.graphRevision, event.payload) };
}

function isHighRiskPlan(plan: ConfirmationPlan | null) {
  return Boolean(plan && ((plan.costCredits ?? 0) > 0 || plan.batch || plan.writesCanvas || plan.skill || plan.app));
}

function recoverFromFailure(state: ConversationState, event: Extract<ConversationEvent, { type: "retry" | "revise" | "recover" }>): ConversationState {
  const decision = state.pendingDecision ?? (state.plan ? pendingDecision(state) : null);
  if (isHighRiskPlan(state.plan) && !state.confirmed) {
    return { ...state, phase: "waiting_for_confirmation", executionState: "idle", error: null, pendingDecision: decision, confirmed: false };
  }
  if (event.type === "retry" && decision) return { ...state, phase: "executing", executionState: "running", error: null, pendingDecision: decision, confirmed: state.confirmed };
  if (event.type === "retry") return { ...state, phase: "understanding", executionState: "idle", error: null, confirmed: false };
  if (event.type === "revise") return { ...state, phase: "drafting_brief", executionState: "idle", error: null, pendingDecision: decision, confirmed: false };
  return { ...state, phase: "understanding", executionState: "idle", error: null, pendingDecision: decision, confirmed: false };
}

function isActive(phase: AgentV6Phase) {
  return phase !== "idle" && phase !== "failed";
}

export function reduceConversation(state: ConversationState, event: ConversationEvent): ConversationState {
  if (event.type === "mode_changed") return { ...state, mode: event.mode };
  if (event.type === "reset") return initialConversationState({ mode: state.mode, contextSnapshot: state.contextSnapshot, graphRevision: state.graphRevision });
  if (event.type === "turn_failed") {
    return isActive(state.phase)
      ? { ...state, phase: "failed", executionState: "failed", error: boundedText(event.error ?? "Agent 执行失败。", 4_000), pendingDecision: state.pendingDecision, confirmed: Boolean(state.confirmed && state.pendingDecision) }
      : state;
  }

  switch (state.phase) {
    case "idle":
      if (event.type === "turn_submitted") return { ...state, phase: "understanding", executionState: "idle", prompt: boundedText(event.prompt, 4_000), error: null, blocks: [], results: [], progress: [], plan: null, pendingDecision: null, confirmed: false };
      if (event.type === "brief_ready") return briefReadyState(state, event);
      return state;
    case "understanding":
      if (event.type === "choice_requested") return { ...state, phase: "waiting_for_choice", pendingQuestionId: event.id };
      if (event.type === "brief_started") return { ...state, phase: "drafting_brief" };
      if (event.type === "brief_ready") return briefReadyState(state, event);
      return state;
    case "waiting_for_choice":
      if (event.type === "choice_submitted" && (!event.id || event.id === state.pendingQuestionId) && event.optionIds.length > 0) return { ...state, phase: "drafting_brief", pendingQuestionId: null };
      return state;
    case "drafting_brief":
      if (event.type === "brief_ready") return briefReadyState(state, event);
      return state;
    case "waiting_for_confirmation":
      if (event.type === "confirmation_granted" && state.pendingDecision?.type === "execute" && state.pendingDecision.decisionId === event.decisionId && state.pendingDecision.graphRevision === event.graphRevision && state.graphRevision === event.graphRevision && state.plan !== null && planMatches(state.plan, event.plan)) return { ...state, phase: "executing", executionState: "running", confirmed: true, pendingDecision: { ...state.pendingDecision, decisionId: event.decisionId } };
      return state;
    case "executing":
      if (event.type === "execution_started") return { ...state, executionState: "running" };
      if (event.type === "verification_started") return { ...state, phase: "verifying", executionState: "verifying" };
      return state;
    case "verifying":
      if (event.type === "results_presented") return { ...state, phase: "presenting_results", executionState: "completed", confirmed: false, pendingDecision: null };
      return state;
    case "presenting_results":
      if (event.type === "refinement_requested") return { ...state, phase: "refining", refiningResultId: event.resultId ?? null };
      return state;
    case "refining":
      if (event.type === "turn_submitted") return { ...state, phase: "understanding", executionState: "idle", prompt: boundedText(event.prompt, 4_000), error: null, blocks: [], results: [], plan: null };
      if (event.type === "brief_ready") return briefReadyState(state, event);
      return state;
    case "failed":
      if (event.type === "retry" || event.type === "revise" || event.type === "recover") return recoverFromFailure(state, event);
    default:
      return state;
  }
}

function isExecutionDecision(decision: AgentDecision) {
  return decision.type === "execute";
}

export function canExecuteDecision(state: ConversationState, decision: AgentDecision): boolean {
  if (!isExecutionDecision(decision) || state.phase !== "executing") return false;
  if (!isSafeDecision(decision) || decision.sessionId !== boundedId(state.sessionId) || decision.turnId !== boundedId(state.turnId) || decision.graphRevision !== state.graphRevision || !decision.idempotencyKey || decision.idempotencyKey !== state.pendingDecision?.idempotencyKey || decision.decisionId !== state.pendingDecision?.decisionId || typeof decision.payload !== "object" || decision.payload === null) return false;
  if (stableSerialize(decision.payload) !== stableSerialize(state.pendingDecision?.payload)) return false;
  const plan = state.plan ?? {};
  const fieldsMatch = (decision.costCredits ?? 0) === (plan.costCredits ?? 0) && Boolean(decision.batch) === Boolean(plan.batch) && Boolean(decision.writesCanvas) === Boolean(plan.writesCanvas) && Boolean(decision.skill) === Boolean(plan.skill) && Boolean(decision.app) === Boolean(plan.app);
  if (state.confirmed) return fieldsMatch && decision.decisionId === state.pendingDecision?.decisionId;
  const paid = (decision.costCredits ?? plan.costCredits ?? 0) > 0;
  const risky = paid || Boolean(decision.batch ?? plan.batch) || Boolean(decision.writesCanvas ?? plan.writesCanvas) || Boolean(decision.skill ?? plan.skill) || Boolean(decision.app ?? plan.app);
  return state.mode === "auto" && !risky && decision.requiresConfirmation !== true;
}
