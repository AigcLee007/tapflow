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
  | { type: "brief_ready"; plan?: ConfirmationPlan; decisionId?: string; graphRevision: number }
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

function isValidGraphRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function normalizeContext(context: ConversationState["contextSnapshot"] | undefined): ConversationState["contextSnapshot"] {
  const source = context ?? EMPTY_CONTEXT;
  return {
    projectId: source.projectId === null ? null : boundedId(source.projectId),
    flowId: source.flowId === null ? null : boundedId(source.flowId),
    selectedNodeIds: source.selectedNodeIds.slice(0, 12).map(boundedId),
    assetRefs: source.assetRefs.slice(0, 12).map((ref) => ({ assetId: boundedId(ref.assetId), refId: boundedId(ref.refId), label: boundedText(ref.label, 400), ...(ref.nodeId ? { nodeId: boundedId(ref.nodeId) } : {}) })),
    uploadedAssetIds: source.uploadedAssetIds.slice(0, 12).map(boundedId),
    skillRefs: source.skillRefs.slice(0, 12).map((ref) => ({ id: boundedId(ref.id), version: Number.isFinite(ref.version) ? ref.version : 0 })),
    appRefs: source.appRefs.slice(0, 12).map(boundedId),
    modelKey: source.modelKey === null ? null : boundedId(source.modelKey),
    graphRevision: Number.isFinite(source.graphRevision) ? source.graphRevision : 0,
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

function decisionIdFor(state: ConversationState, decisionId?: string) {
  const supplied = boundedId(decisionId).trim();
  return supplied || boundedId(`decision:${boundedId(state.sessionId) || "session"}:${boundedId(state.turnId) || "turn"}:${state.graphRevision}`);
}

function pendingDecision(state: ConversationState, decisionId?: string, graphRevision = state.graphRevision): AgentDecision {
  const stableId = decisionIdFor(state, decisionId);
  return { type: "execute", decisionId: stableId, sessionId: boundedId(state.sessionId) || "session", turnId: boundedId(state.turnId) || "turn", graphRevision, payload: {}, idempotencyKey: stableId };
}

function isSafeDecision(decision: AgentDecision) {
  const payload = JSON.stringify(decision.payload);
  return decision.sessionId.length <= 200 && decision.turnId.length <= 200 && decision.idempotencyKey.length <= 200 && decision.decisionId.length <= 200 && isValidGraphRevision(decision.graphRevision) && typeof payload === "string" && payload.length <= 4_000 && (decision.costCredits === undefined || (Number.isFinite(decision.costCredits) && decision.costCredits >= 0));
}

function planMatches(left: ConfirmationPlan | null, right: ConfirmationPlan | undefined) {
  if (!right) return true;
  return JSON.stringify(normalizePlan(left ?? {})) === JSON.stringify(normalizePlan(right));
}

function briefReadyState(state: ConversationState, event: Extract<ConversationEvent, { type: "brief_ready" }>): ConversationState {
  if (!isValidGraphRevision(event.graphRevision)) return state;
  const next = { ...state, graphRevision: event.graphRevision, contextSnapshot: { ...state.contextSnapshot, graphRevision: event.graphRevision }, phase: "waiting_for_confirmation" as const, plan: normalizePlan(event.plan), confirmed: false };
  return { ...next, pendingDecision: pendingDecision(next, event.decisionId, event.graphRevision) };
}

function isActive(phase: AgentV6Phase) {
  return phase !== "idle" && phase !== "failed";
}

export function reduceConversation(state: ConversationState, event: ConversationEvent): ConversationState {
  if (event.type === "mode_changed") return { ...state, mode: event.mode };
  if (event.type === "reset") return initialConversationState({ mode: state.mode, contextSnapshot: state.contextSnapshot });
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
      if (event.type === "brief_ready") return { ...state, phase: "waiting_for_confirmation", plan: normalizePlan(event.plan), pendingDecision: pendingDecision(state, event.decisionId), confirmed: false };
      return state;
    case "failed":
      if (event.type === "retry") {
        const decision = state.pendingDecision ?? (state.plan ? pendingDecision(state) : null);
        return decision
          ? { ...state, phase: "executing", executionState: "running", error: null, pendingDecision: decision, confirmed: Boolean(state.confirmed && decision) }
          : { ...state, phase: "understanding", executionState: "idle", error: null, confirmed: false };
      }
      if (event.type === "revise") return { ...state, phase: "drafting_brief", executionState: "idle", error: null, confirmed: false };
      if (event.type === "recover") return { ...state, phase: "understanding", executionState: "idle", error: null, confirmed: false };
    default:
      return state;
  }
}

function isExecutionDecision(decision: AgentDecision) {
  return decision.type === "execute";
}

export function canExecuteDecision(state: ConversationState, decision: AgentDecision): boolean {
  if (!isExecutionDecision(decision) || state.phase !== "executing") return false;
  if (!isSafeDecision(decision) || decision.sessionId !== boundedId(state.sessionId) || decision.turnId !== boundedId(state.turnId) || decision.graphRevision !== state.graphRevision || !decision.idempotencyKey || typeof decision.payload !== "object" || decision.payload === null) return false;
  const plan = state.plan ?? {};
  const fieldsMatch = (decision.costCredits ?? 0) === (plan.costCredits ?? 0) && Boolean(decision.batch) === Boolean(plan.batch) && Boolean(decision.writesCanvas) === Boolean(plan.writesCanvas) && Boolean(decision.skill) === Boolean(plan.skill) && Boolean(decision.app) === Boolean(plan.app);
  if (state.confirmed) return fieldsMatch && decision.decisionId === state.pendingDecision?.decisionId;
  const paid = (decision.costCredits ?? plan.costCredits ?? 0) > 0;
  const risky = paid || Boolean(decision.batch ?? plan.batch) || Boolean(decision.writesCanvas ?? plan.writesCanvas) || Boolean(decision.skill ?? plan.skill) || Boolean(decision.app ?? plan.app);
  return state.mode === "auto" && !risky && decision.requiresConfirmation !== true;
}
