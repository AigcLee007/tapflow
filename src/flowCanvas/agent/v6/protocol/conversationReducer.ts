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
  | { type: "brief_ready"; plan?: ConfirmationPlan }
  | { type: "confirmation_granted"; decisionId?: string }
  | { type: "execution_started" }
  | { type: "verification_started" }
  | { type: "results_presented" }
  | { type: "refinement_requested"; resultId?: string }
  | { type: "turn_failed"; error?: string }
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
  return {
    phase: "idle",
    mode: "manual_confirmation",
    prompt: null,
    pendingQuestionId: null,
    pendingDecision: null,
    plan: null,
    confirmed: false,
    blocks: [],
    contextSnapshot: { ...EMPTY_CONTEXT, ...(overrides.contextSnapshot ?? {}) },
    progress: [],
    results: [],
    refiningResultId: null,
    graphRevision: overrides.graphRevision ?? 0,
    error: null,
    ...overrides,
  };
}

function isActive(phase: AgentV6Phase) {
  return phase !== "idle" && phase !== "failed";
}

export function reduceConversation(state: ConversationState, event: ConversationEvent): ConversationState {
  if (event.type === "mode_changed") return { ...state, mode: event.mode };
  if (event.type === "reset") return initialConversationState({ mode: state.mode, contextSnapshot: state.contextSnapshot });
  if (event.type === "turn_failed") {
    return isActive(state.phase)
      ? { ...state, phase: "failed", error: event.error ?? "Agent 执行失败。", pendingDecision: null }
      : state;
  }

  switch (state.phase) {
    case "idle":
      if (event.type === "turn_submitted") return { ...state, phase: "understanding", prompt: event.prompt, error: null, blocks: [], results: [], progress: [], plan: null, pendingDecision: null, confirmed: false };
      if (event.type === "brief_ready") return { ...state, phase: "waiting_for_confirmation", plan: event.plan ?? {}, pendingDecision: { type: "execute" }, confirmed: false };
      return state;
    case "understanding":
      if (event.type === "choice_requested") return { ...state, phase: "waiting_for_choice", pendingQuestionId: event.id };
      if (event.type === "brief_started") return { ...state, phase: "drafting_brief" };
      if (event.type === "brief_ready") return { ...state, phase: "waiting_for_confirmation", plan: event.plan ?? {}, pendingDecision: { type: "execute" }, confirmed: false };
      return state;
    case "waiting_for_choice":
      if (event.type === "choice_submitted" && (!event.id || event.id === state.pendingQuestionId) && event.optionIds.length > 0) return { ...state, phase: "drafting_brief", pendingQuestionId: null };
      return state;
    case "drafting_brief":
      if (event.type === "brief_ready") return { ...state, phase: "waiting_for_confirmation", plan: event.plan ?? {}, pendingDecision: { type: "execute" }, confirmed: false };
      return state;
    case "waiting_for_confirmation":
      if (event.type === "confirmation_granted") return { ...state, phase: "executing", confirmed: true, pendingDecision: { type: "execute", decisionId: event.decisionId } };
      return state;
    case "executing":
      if (event.type === "verification_started") return { ...state, phase: "verifying" };
      return state;
    case "verifying":
      if (event.type === "results_presented") return { ...state, phase: "presenting_results", confirmed: false, pendingDecision: null };
      return state;
    case "presenting_results":
      if (event.type === "refinement_requested") return { ...state, phase: "refining", refiningResultId: event.resultId ?? null };
      return state;
    case "refining":
      if (event.type === "turn_submitted") return { ...state, phase: "understanding", prompt: event.prompt, error: null, blocks: [], results: [], plan: null };
      if (event.type === "brief_ready") return { ...state, phase: "waiting_for_confirmation", plan: event.plan ?? {}, pendingDecision: { type: "execute" }, confirmed: false };
      return state;
    case "failed":
    default:
      return state;
  }
}

function isExecutionDecision(decision: AgentDecision) {
  return decision.type === "execute";
}

export function canExecuteDecision(state: ConversationState, decision: AgentDecision): boolean {
  if (!isExecutionDecision(decision) || state.phase === "failed" || state.phase === "idle" || state.phase === "understanding" || state.phase === "waiting_for_choice" || state.phase === "drafting_brief") return false;
  if (state.confirmed) return true;
  const plan = state.plan ?? {};
  const paid = (decision.costCredits ?? plan.costCredits ?? 0) > 0;
  const risky = paid || Boolean(decision.batch ?? plan.batch) || Boolean(decision.writesCanvas ?? plan.writesCanvas) || Boolean(decision.skill ?? plan.skill) || Boolean(decision.app ?? plan.app);
  return state.mode === "auto" && !risky && decision.requiresConfirmation !== true;
}
