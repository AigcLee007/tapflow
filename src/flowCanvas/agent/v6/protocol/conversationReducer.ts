import type {
  AgentDecision,
  AgentExecutionMode,
  AgentV6Phase,
  ConfirmationPlan,
  ConversationState,
  ChoiceSubmission,
} from "./conversationTypes";
import {
  AGENT_V6_LABEL_MAX_LENGTH,
  AGENT_V6_ID_MAX_LENGTH,
  AGENT_V6_MAX_ITEMS,
  AGENT_V6_TEXT_MAX_LENGTH,
} from "./conversationTypes";
import { normalizeBlocks } from "./blockNormalizer";
import { normalizeStableId, stableHash } from "./stableId";

export type ConversationEvent =
  | { type: "turn_submitted"; prompt: string; turnId?: string; eventId?: string }
  | { type: "choice_requested"; id?: string }
  | { type: "choice_submitted"; sessionId: string; turnId: string; graphRevision: number; idempotencyKey: string; pendingQuestionId: string; payload: Record<string, unknown>; optionIds: string[] }
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
  | { type: "reset"; turnId?: string; eventId?: string };

export type ConversationIdFactory = () => string;
export type ConversationReducerOptions = { createId?: ConversationIdFactory; replaySeed?: string };

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

export function initialConversationState(overrides: Partial<ConversationState> = {}, options: ConversationReducerOptions = {}): ConversationState {
  const graphRevision = isValidGraphRevision(overrides.graphRevision) ? overrides.graphRevision : 0;
  const context = { ...normalizeContext(overrides.contextSnapshot), graphRevision };
  const explicitSessionId = normalizeStableId(overrides.sessionId);
  const explicitTurnId = normalizeStableId(overrides.turnId);
  const sessionId = explicitSessionId ?? (options.replaySeed
    ? generatedId("session", options.createId, { kind: "initial-session", replaySeed: options.replaySeed, context: overrides.contextSnapshot })
    : randomId("session", options.createId));
  const turnId = explicitTurnId ?? (options.replaySeed || explicitSessionId
    ? generatedId("turn", options.createId, { kind: "initial-turn", replaySeed: options.replaySeed, sessionId })
    : randomId("turn", options.createId));
  const baseState = {
    phase: "idle",
    executionState: "idle",
    pendingDecision: null,
    confirmed: false,
    refiningResultId: null,
    pendingChoice: null,
    choiceSubmission: null,
    mode: overrides.mode === "auto" ? "auto" : "manual_confirmation",
    prompt: typeof overrides.prompt === "string" ? boundedText(overrides.prompt, AGENT_V6_TEXT_MAX_LENGTH) : null,
    pendingQuestionId: normalizeStableId(overrides.pendingQuestionId) ?? null,
    blocks: normalizeBlocks(overrides.blocks),
    progress: [],
    results: [],
    sessionId,
    turnId,
    error: typeof overrides.error === "string" ? boundedText(overrides.error, AGENT_V6_TEXT_MAX_LENGTH) : null,
    graphRevision,
    plan: normalizePlan(overrides.plan ?? undefined),
    contextSnapshot: context,
  };
  return {
    ...baseState,
    pendingChoice: normalizePendingChoice(overrides.pendingChoice, baseState),
    choiceSubmission: normalizeChoiceSubmissionValue(overrides.choiceSubmission),
  };
}

function boundedText(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function boundedId(value: unknown) {
  return normalizeStableId(value) ?? "";
}

function generatedId(prefix: string, createId?: ConversationIdFactory, seed?: unknown) {
  if (!createId) return `${prefix}-${stableHash(seed ?? { prefix })}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidate = createId();
    const normalized = normalizeStableId(candidate);
    if (normalized && normalized.length <= AGENT_V6_ID_MAX_LENGTH) return normalized;
  }
  return `${prefix}-${stableHash(seed ?? { prefix })}`;
}

function randomId(prefix: string, createId?: ConversationIdFactory) {
  if (createId) return generatedId(prefix, createId);
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function eventTurnId(prefix: string, event: { turnId?: string; eventId?: string }, options: ConversationReducerOptions, seed: Record<string, unknown>) {
  const turnId = normalizeStableId(event.turnId);
  if (turnId) return turnId;
  if (normalizeStableId(event.eventId) || options.replaySeed) {
    return generatedId(prefix, options.createId, { ...seed, eventId: event.eventId, replaySeed: options.replaySeed });
  }
  return randomId(prefix, options.createId);
}

function normalizeStableIds(value: unknown) {
  return Array.isArray(value)
    ? value.slice(0, AGENT_V6_MAX_ITEMS).flatMap((item) => {
      const id = normalizeStableId(item);
      return id ? [id] : [];
    })
    : [];
}

function normalizeUniqueStableIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const id = normalizeStableId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= AGENT_V6_MAX_ITEMS) break;
  }
  return ids;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValidGraphRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isValidCostCredits(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeContext(context: ConversationState["contextSnapshot"] | undefined): ConversationState["contextSnapshot"] {
  const source = isPlainObject(context) ? context : EMPTY_CONTEXT;
  const strings = (value: unknown, limit = AGENT_V6_MAX_ITEMS) => Array.isArray(value) ? value.slice(0, limit).flatMap((item) => {
    const stableId = normalizeStableId(item);
    return stableId ? [stableId] : [];
  }) : [];
  const assetRefs = Array.isArray(source.assetRefs) ? source.assetRefs.slice(0, AGENT_V6_MAX_ITEMS).flatMap((value) => {
    if (!isPlainObject(value) || typeof value.label !== "string") return [];
    const assetId = normalizeStableId(value.assetId);
    const refId = normalizeStableId(value.refId);
    const nodeId = value.nodeId === undefined ? undefined : normalizeStableId(value.nodeId);
    if (!assetId || !refId || (value.nodeId !== undefined && !nodeId)) return [];
    return [{ assetId, refId, label: boundedText(value.label, AGENT_V6_LABEL_MAX_LENGTH), ...(nodeId ? { nodeId } : {}) }];
  }) : [];
  const skillRefs = Array.isArray(source.skillRefs) ? source.skillRefs.slice(0, AGENT_V6_MAX_ITEMS).flatMap((value) => {
    if (!isPlainObject(value)) return [];
    const id = normalizeStableId(value.id);
    if (!id) return [];
    return [{ id, version: typeof value.version === "number" && Number.isFinite(value.version) && value.version >= 0 ? value.version : 0 }];
  }) : [];
  const projectId = normalizeStableId(source.projectId);
  const flowId = normalizeStableId(source.flowId);
  const modelKey = normalizeStableId(source.modelKey);
  return {
    projectId: projectId ?? null,
    flowId: flowId ?? null,
    selectedNodeIds: strings(source.selectedNodeIds, 12),
    assetRefs,
    uploadedAssetIds: strings(source.uploadedAssetIds, 12),
    skillRefs,
    appRefs: strings(source.appRefs, 12),
    modelKey: modelKey ?? null,
    graphRevision: isValidGraphRevision(source.graphRevision) ? source.graphRevision : 0,
  };
}

function normalizePlan(plan: ConfirmationPlan | undefined): ConfirmationPlan {
  if (!plan) return {};
  const policyHash = isPlainObject(plan.serverPolicy) ? normalizeStableId(plan.serverPolicy.policyHash) : undefined;
  const serverPolicy = isPlainObject(plan.serverPolicy) && typeof plan.serverPolicy.requiresConfirmation === "boolean" && policyHash
    ? { requiresConfirmation: plan.serverPolicy.requiresConfirmation, policyHash }
    : undefined;
  return {
    ...(typeof plan.title === "string" ? { title: boundedText(plan.title, 400) } : {}),
    ...(typeof plan.summary === "string" ? { summary: boundedText(plan.summary, 4_000) } : {}),
    ...(typeof plan.costCredits === "number" && Number.isFinite(plan.costCredits) ? { costCredits: Math.max(0, plan.costCredits) } : {}),
    ...(serverPolicy ? { serverPolicy } : {}),
    ...(plan.batch === true ? { batch: true } : {}),
    ...(plan.writesCanvas === true ? { writesCanvas: true } : {}),
    ...(plan.skill === true ? { skill: true } : {}),
    ...(plan.app === true ? { app: true } : {}),
  };
}

function normalizePendingChoice(value: ConversationState["pendingChoice"] | undefined, state: Pick<ConversationState, "sessionId" | "turnId" | "graphRevision">): ConversationState["pendingChoice"] {
  if (!value || normalizeStableId(value.pendingQuestionId) !== value.pendingQuestionId || normalizeStableId(value.sessionId) !== value.sessionId || normalizeStableId(value.turnId) !== value.turnId || normalizeStableId(value.idempotencyKey) !== value.idempotencyKey || value.graphRevision !== state.graphRevision || value.sessionId !== state.sessionId || value.turnId !== state.turnId) return null;
  return value;
}

function normalizeChoiceSubmissionValue(value: ChoiceSubmission | null | undefined): ChoiceSubmission | null {
  if (!value) return null;
  const pendingQuestionId = boundedId(value.pendingQuestionId);
  const payload = normalizeApprovedPayload(value.payload);
  const optionIds = normalizeStableIds(value.optionIds);
  return pendingQuestionId && payload && optionIds.length ? { pendingQuestionId, payload, optionIds } : null;
}

const SAFE_PAYLOAD_KEYS = new Set(["prompt", "text", "value", "field", "optionIds", "resultId", "assetId", "assetIds", "nodeId", "nodeIds", "refId", "refIds", "modelKey", "skillId", "appId", "mode", "fields", "options", "parameters", "referenceIds", "uploadedAssetIds"]);
const STABLE_REFERENCE_PAYLOAD_KEYS = new Set([
  "assetid",
  "assetids",
  "nodeid",
  "nodeids",
  "refid",
  "refids",
  "referenceid",
  "referenceids",
  "uploadedassetid",
  "uploadedassetids",
  "resultid",
  "optionids",
  "selectednodeids",
]);
const MAX_PAYLOAD_DEPTH = 32;
const MAX_PAYLOAD_NODES = 256;
const MAX_PAYLOAD_ARRAY_LENGTH = 32;
const MAX_PAYLOAD_KEYS = 32;
const MAX_PAYLOAD_STRING_LENGTH = 4_000;

function normalizePayloadKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const SENSITIVE_PAYLOAD_KEYS = new Set([
  "provider",
  "route",
  "credential",
  "credentialId",
  "apiKey",
  "apiSecret",
  "clientSecret",
  "privateKey",
  "refreshToken",
  "accessToken",
  "authTag",
  "nonce",
  "baseUrl",
  "signedUrl",
  "authorization",
  "token",
  "secret",
  "password",
  "html",
  "data",
  "blob",
  "base64",
].map(normalizePayloadKey));

function isSensitiveString(value: string) {
  if (/^(?:data:|blob:)/i.test(value)) return true;
  if (/(?:authorization\s*:\s*|\b(?:bearer|basic)\s+)\S+/i.test(value)) return true;
  if (/^ey[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+$/i.test(value)) return true;
  if (/^(?:sk-|rk-|gh[pousr]_|xox[baprs]-|AIza)/i.test(value)) return true;
  return value.length >= 64 && /^[a-z0-9+/=_-]+$/i.test(value) && (/[+/=_-]/.test(value) || value.length >= 128);
}

function isStableReferenceValue(value: unknown): boolean {
  if (typeof value === "string") return Boolean(normalizeStableId(value)) && !isSensitiveString(value);
  return Array.isArray(value) && value.every((item) => isStableReferenceValue(item));
}

function hasInvalidStableReference(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasInvalidStableReference(item, seen));
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, item]) => {
    return (STABLE_REFERENCE_PAYLOAD_KEYS.has(normalizePayloadKey(key)) && !isStableReferenceValue(item))
      || hasInvalidStableReference(item, seen);
  });
}

function isPayloadWithinLimits(value: unknown, depth = 0, state = { nodes: 0, seen: new Set<object>() }): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= MAX_PAYLOAD_STRING_LENGTH;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || depth > MAX_PAYLOAD_DEPTH || state.seen.has(value)) return false;
  state.nodes += 1;
  if (state.nodes > MAX_PAYLOAD_NODES) return false;
  state.seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.length <= MAX_PAYLOAD_ARRAY_LENGTH && value.every((item) => isPayloadWithinLimits(item, depth + 1, state));
    }
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value);
    return keys.length <= MAX_PAYLOAD_KEYS && keys.every((key) => key.length <= MAX_PAYLOAD_STRING_LENGTH && isPayloadWithinLimits(value[key], depth + 1, state));
  } catch {
    return false;
  }
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
    if (STABLE_REFERENCE_PAYLOAD_KEYS.has(normalizedKey) && !isStableReferenceValue(item)) return null;
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
    if (!isPayloadWithinLimits(value)) return null;
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

function normalizeApprovedPayload(payload: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!isPayloadWithinLimits(payload ?? {}) || hasInvalidStableReference(payload ?? {})) return null;
  try {
    const normalized = sanitizePayloadValue(payload ?? {}, false, true, new Set());
    return isPlainObject(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

function decisionIdFor(decisionId: string | undefined, createId: ConversationIdFactory | undefined, seed: unknown) {
  if (decisionId !== undefined) return boundedId(decisionId);
  return generatedId("decision", createId, seed);
}

function pendingDecision(state: ConversationState, decisionId?: string, graphRevision = state.graphRevision, payload?: Record<string, unknown>, createId?: ConversationIdFactory, identitySeed?: unknown): AgentDecision | null {
  const seed = identitySeed ?? { sessionId: state.sessionId, turnId: state.turnId, graphRevision, plan: state.plan, payload };
  const stableId = decisionIdFor(decisionId, createId, { kind: "decision", seed });
  const idempotencyKey = generatedId("idempotency", createId, { kind: "idempotency", seed });
  if (!stableId || !idempotencyKey) return null;
  const normalizedPayload = normalizeApprovedPayload(payload);
  if (!normalizedPayload) return null;
  const sessionId = normalizeStableId(state.sessionId);
  const turnId = normalizeStableId(state.turnId);
  if (!sessionId || !turnId) return null;
  return {
    type: "execute", decisionId: stableId, sessionId, turnId, graphRevision, payload: normalizedPayload, idempotencyKey,
    ...(state.plan?.costCredits !== undefined ? { costCredits: state.plan.costCredits } : {}),
    ...(state.plan?.batch !== undefined ? { batch: state.plan.batch } : {}),
    ...(state.plan?.writesCanvas !== undefined ? { writesCanvas: state.plan.writesCanvas } : {}),
    ...(state.plan?.skill !== undefined ? { skill: state.plan.skill } : {}),
    ...(state.plan?.app !== undefined ? { app: state.plan.app } : {}),
  };
}

function isSafeDecision(decision: unknown): decision is AgentDecision {
  if (!isPlainObject(decision) || typeof decision.sessionId !== "string" || typeof decision.turnId !== "string" || typeof decision.idempotencyKey !== "string" || typeof decision.decisionId !== "string" || typeof decision.payload !== "object" || decision.payload === null) return false;
  const typed = decision as AgentDecision;
  return Boolean(normalizeStableId(typed.sessionId) && normalizeStableId(typed.turnId) && normalizeStableId(typed.idempotencyKey) && normalizeStableId(typed.decisionId) && isValidGraphRevision(typed.graphRevision) && (typed.type !== "execute" || typed.costCredits === undefined || isValidCostCredits(typed.costCredits)) && stableSerialize(typed.payload) !== null);
}

function isSafePlan(plan: ConfirmationPlan | null | undefined) {
  return !plan || ((plan.costCredits === undefined || isValidCostCredits(plan.costCredits)) && (!plan.serverPolicy || (typeof plan.serverPolicy.requiresConfirmation === "boolean" && Boolean(normalizeStableId(plan.serverPolicy.policyHash)))));
}

function currentChoiceBlock(state: ConversationState) {
  return state.blocks.find((block) => block.type === "choice_grid" && block.id === state.pendingQuestionId);
}

function normalizeChoiceSubmission(event: Extract<ConversationEvent, { type: "choice_submitted" }>): ChoiceSubmission | null {
  const payload = normalizeApprovedPayload(event.payload);
  const optionIds = normalizeUniqueStableIds(event.optionIds);
  return payload && optionIds.length ? { pendingQuestionId: boundedId(event.pendingQuestionId), payload, optionIds } : null;
}

function planMatches(left: ConfirmationPlan | null, right: ConfirmationPlan | undefined) {
  if (!right) return true;
  return JSON.stringify(normalizePlan(left ?? {})) === JSON.stringify(normalizePlan(right));
}

function briefReadyState(state: ConversationState, event: Extract<ConversationEvent, { type: "brief_ready" }>, createId?: ConversationIdFactory): ConversationState {
  if (!isValidGraphRevision(event.graphRevision) || event.graphRevision < state.graphRevision || !isSafePlan(event.plan)) return state;
  const plan = normalizePlan(event.plan);
  const next = { ...state, graphRevision: event.graphRevision, contextSnapshot: { ...state.contextSnapshot, graphRevision: event.graphRevision }, phase: "waiting_for_confirmation" as const, plan, confirmed: false };
  const decision = pendingDecision(next, event.decisionId, event.graphRevision, event.payload, createId, event);
  if (!decision) return state;
  if (state.mode === "auto" && plan.serverPolicy?.policyHash && plan.serverPolicy.requiresConfirmation === false && costsMatch(plan, decision)) {
    return { ...next, phase: "executing", executionState: "running", pendingDecision: decision };
  }
  return { ...next, pendingDecision: decision };
}

function isHighRiskPlan(plan: ConfirmationPlan | null) {
  return Boolean(plan && ((plan.costCredits ?? 0) > 0 || plan.batch || plan.writesCanvas || plan.skill || plan.app));
}

function costsMatch(plan: ConfirmationPlan | null, decision: AgentDecision | null | undefined) {
  return Boolean(decision && decision.type === "execute" && plan?.costCredits === decision.costCredits);
}

function recoverFromFailure(state: ConversationState, event: Extract<ConversationEvent, { type: "retry" | "revise" | "recover" }>, createId?: ConversationIdFactory): ConversationState {
  const decision = state.pendingDecision ?? (state.plan ? pendingDecision(state, undefined, state.graphRevision, undefined, createId) : null);
  if (decision && !state.confirmed && (isHighRiskPlan(state.plan) || (event.type === "retry" && state.mode === "manual_confirmation"))) {
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

export function reduceConversation(state: ConversationState, event: ConversationEvent, options: ConversationReducerOptions = {}): ConversationState {
  if (event.type === "mode_changed") return { ...state, mode: event.mode };
  if (event.type === "reset") return initialConversationState({
    mode: state.mode,
    sessionId: normalizeStableId(state.sessionId) ?? generatedId("session", options.createId, { kind: "reset-session", sessionId: state.sessionId, turnId: state.turnId, graphRevision: state.graphRevision }),
    turnId: eventTurnId("turn", event, options, { kind: "reset-turn", sessionId: state.sessionId, turnId: state.turnId, graphRevision: state.graphRevision }),
    contextSnapshot: state.contextSnapshot,
    graphRevision: state.graphRevision,
  }, options);
  if (event.type === "turn_failed") {
    return isActive(state.phase)
      ? { ...state, phase: "failed", executionState: "failed", error: boundedText(event.error ?? "Agent 执行失败。", 4_000), pendingDecision: state.pendingDecision, confirmed: Boolean(state.confirmed && state.pendingDecision) }
      : state;
  }

  switch (state.phase) {
    case "idle":
      if (event.type === "turn_submitted") return { ...state, phase: "understanding", executionState: "idle", prompt: boundedText(event.prompt, 4_000), error: null, blocks: [], results: [], progress: [], plan: null, pendingDecision: null, confirmed: false };
      return state;
    case "understanding":
      if (event.type === "choice_requested") {
        const questionId = normalizeStableId(event.id) ?? generatedId("question", options.createId, { kind: "choice-question", sessionId: state.sessionId, turnId: state.turnId, event });
        const idempotencyKey = generatedId("choice", options.createId, { kind: "choice", sessionId: state.sessionId, turnId: state.turnId, questionId, event });
        return questionId && idempotencyKey
          ? { ...state, phase: "waiting_for_choice", pendingQuestionId: questionId, pendingChoice: { pendingQuestionId: questionId, sessionId: state.sessionId!, turnId: state.turnId!, graphRevision: state.graphRevision, idempotencyKey }, choiceSubmission: null }
          : state;
      }
      if (event.type === "brief_started") return { ...state, phase: "drafting_brief" };
      return state;
    case "waiting_for_choice":
      if (event.type === "choice_submitted") {
        const choice = state.pendingChoice;
        const block = currentChoiceBlock(state);
        const submission = normalizeChoiceSubmission(event);
        const validOptions = submission?.optionIds.every((optionId) => block?.options.some((option) => option.id === optionId)) ?? false;
        const validSelectionMode = block?.selectionMode === "single"
          ? submission?.optionIds.length === 1
          : block?.selectionMode === "multiple";
        if (choice && block && submission && event.sessionId === choice.sessionId && event.turnId === choice.turnId && event.graphRevision === choice.graphRevision && event.idempotencyKey === choice.idempotencyKey && submission.pendingQuestionId === choice.pendingQuestionId && validOptions && validSelectionMode) {
          const blocks = state.blocks.map((item) => item.type === "choice_grid" && item.id === choice.pendingQuestionId ? { ...item, selectedOptionIds: submission.optionIds } : item);
          return { ...state, phase: "drafting_brief", pendingQuestionId: null, pendingChoice: null, choiceSubmission: submission, blocks };
        }
      }
      return state;
    case "drafting_brief":
      if (event.type === "brief_ready") return briefReadyState(state, event, options.createId);
      return state;
    case "waiting_for_confirmation":
      if (event.type === "confirmation_granted" && state.pendingDecision?.type === "execute" && state.pendingDecision.decisionId === event.decisionId && state.pendingDecision.graphRevision === event.graphRevision && state.graphRevision === event.graphRevision && state.plan !== null && planMatches(state.plan, event.plan) && costsMatch(state.plan, state.pendingDecision)) return { ...state, phase: "executing", executionState: "running", confirmed: true, pendingDecision: { ...state.pendingDecision, decisionId: event.decisionId } };
      return state;
    case "executing":
      if (event.type === "execution_started") return { ...state, executionState: "running" };
      if (event.type === "verification_started") return { ...state, phase: "verifying", executionState: "verifying" };
      return state;
    case "verifying":
      if (event.type === "results_presented") return { ...state, phase: "presenting_results", executionState: "completed", confirmed: false, pendingDecision: null };
      return state;
    case "presenting_results":
      if (event.type === "refinement_requested") {
        const resultId = event.resultId === undefined ? null : normalizeStableId(event.resultId);
        return event.resultId === undefined || resultId ? { ...state, phase: "refining", refiningResultId: resultId ?? null } : state;
      }
      return state;
    case "refining":
      if (event.type === "turn_submitted") return { ...state, phase: "understanding", executionState: "idle", turnId: eventTurnId("turn", event, options, { kind: "refinement-turn", sessionId: state.sessionId, turnId: state.turnId, prompt: event.prompt, graphRevision: state.graphRevision }), prompt: boundedText(event.prompt, 4_000), error: null, blocks: [], results: [], plan: null, pendingDecision: null, pendingQuestionId: null, pendingChoice: null, choiceSubmission: null, confirmed: false };
      return state;
    case "failed":
      if (event.type === "retry" || event.type === "revise" || event.type === "recover") return recoverFromFailure(state, event, options.createId);
    default:
      return state;
  }
}

function isExecutionDecision(decision: unknown): decision is AgentDecision {
  return isPlainObject(decision) && decision.type === "execute";
}

export function canExecuteDecision(state: ConversationState, decision: unknown): boolean {
  if (!isExecutionDecision(decision) || state.phase !== "executing") return false;
  if (!isSafePlan(state.plan) || !isSafeDecision(decision) || !costsMatch(state.plan, decision) || !costsMatch(state.plan, state.pendingDecision) || decision.sessionId !== state.sessionId || decision.turnId !== state.turnId || decision.graphRevision !== state.graphRevision || !decision.idempotencyKey || decision.idempotencyKey !== state.pendingDecision?.idempotencyKey || decision.decisionId !== state.pendingDecision?.decisionId || typeof decision.payload !== "object" || decision.payload === null) return false;
  if (stableSerialize(decision.payload) !== stableSerialize(state.pendingDecision?.payload)) return false;
  if (state.confirmed) return decision.decisionId === state.pendingDecision?.decisionId;
  const storedDecision = state.pendingDecision;
  const storedPlan = state.plan ?? (storedDecision?.type === "execute" ? {
    costCredits: storedDecision.costCredits,
    batch: storedDecision.batch,
    writesCanvas: storedDecision.writesCanvas,
    skill: storedDecision.skill,
    app: storedDecision.app,
  } : null);
  return state.mode === "auto" && Boolean(storedPlan?.serverPolicy?.policyHash) && storedPlan.serverPolicy?.requiresConfirmation === false && decision.requiresConfirmation !== true;
}
