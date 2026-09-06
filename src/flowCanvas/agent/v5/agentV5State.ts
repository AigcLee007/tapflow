import type {
  AgentDecision,
  AgentExecutionMode,
  AgentV5Event,
  AgentV5ExecutionPolicy,
  AgentV5Plan,
  AgentV5State,
  ConversationBlock,
  ProgressStep,
  ResultRef,
} from "./agentV5Types";

export type {
  AgentDecision,
  AgentExecutionMode,
  AgentV5Event,
  AgentV5ExecutionPolicy,
  AgentV5Plan,
  AgentV5State,
} from "./agentV5Types";

const DEFAULT_POLICY: Required<AgentV5ExecutionPolicy> = {
  allowSafeAutoExecute: true,
  allowPaidAutoExecute: false,
  allowBatchAutoExecute: false,
  allowCanvasWriteAutoExecute: false,
  allowSkillAutoExecute: false,
  allowAppAutoExecute: false,
};

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
};

export function initialAgentV5State(overrides: Partial<AgentV5State> = {}): AgentV5State {
  return {
    blocks: [],
    confirmed: false,
    contextSnapshot: { ...EMPTY_CONTEXT, ...(overrides.contextSnapshot ?? {}) },
    error: null,
    mode: "manual_confirmation",
    pendingDecision: null,
    pendingQuestionId: null,
    phase: "idle",
    plan: null,
    policy: { ...DEFAULT_POLICY, ...(overrides.policy ?? {}) },
    progress: [],
    prompt: null,
    refiningResultId: null,
    results: [],
    ...overrides,
  };
}

function isActivePhase(phase: AgentV5State["phase"]): boolean {
  return phase !== "idle" && phase !== "failed";
}

function cloneResults(results: ResultRef[] | undefined): ResultRef[] {
  return results ? results.map((result) => ({ ...result })) : [];
}

function cloneBlocks(blocks: ConversationBlock[] | undefined): ConversationBlock[] {
  return blocks ? blocks.slice() : [];
}

export function reduceAgentV5State(state: AgentV5State, event: AgentV5Event): AgentV5State {
  if (event.type === "reset") return initialAgentV5State({ mode: state.mode, policy: state.policy });

  if (event.type === "turn_failed") {
    return isActivePhase(state.phase)
      ? { ...state, error: event.error ?? "Agent 执行失败。", phase: "failed", pendingDecision: null }
      : state;
  }

  switch (state.phase) {
    case "idle":
      if (event.type === "user_submitted") {
        return {
          ...state,
          blocks: [],
          confirmed: false,
          error: null,
          pendingDecision: null,
          pendingQuestionId: null,
          phase: "understanding",
          plan: null,
          prompt: event.prompt,
          refiningResultId: null,
          results: [],
        };
      }
      if (event.type === "brief_ready" || event.type === "plan_ready") {
        return {
          ...state,
          confirmed: false,
          error: null,
          phase: "waiting_for_confirmation",
          pendingDecision: { type: "execute" },
          plan: event.plan ?? {},
        };
      }
      return state;

    case "understanding":
      if (event.type === "agent_asked_question") {
        return { ...state, pendingQuestionId: event.questionId, phase: "waiting_for_choice" };
      }
      if (event.type === "brief_started") return { ...state, phase: "drafting_brief" };
      if (event.type === "brief_ready" || event.type === "plan_ready") return { ...state, confirmed: false, pendingDecision: { type: "execute" }, phase: "waiting_for_confirmation", plan: event.plan ?? {} };
      return state;

    case "waiting_for_choice":
      if (event.type === "choice_submitted" || event.type === "choice_selected") {
        return { ...state, pendingQuestionId: null, phase: "drafting_brief" };
      }
      if (event.type === "brief_ready" || event.type === "plan_ready") return { ...state, confirmed: false, pendingDecision: { type: "execute" }, phase: "waiting_for_confirmation", plan: event.plan ?? {} };
      return state;

    case "drafting_brief":
      if (event.type === "brief_ready" || event.type === "plan_ready") {
        return { ...state, confirmed: false, pendingDecision: { type: "execute" }, phase: "waiting_for_confirmation", plan: event.plan ?? {} };
      }
      return state;

    case "waiting_for_confirmation":
      if (event.type === "confirmation_granted") {
        return { ...state, confirmed: true, pendingDecision: { type: "execute" }, phase: "executing" };
      }
      if (event.type === "execution_started" && state.confirmed) return { ...state, phase: "executing" };
      return state;

    case "executing":
      if (event.type === "execution_completed") {
        return {
          ...state,
          blocks: cloneBlocks(event.blocks ?? state.blocks),
          pendingDecision: null,
          phase: "presenting_results",
          progress: state.progress.map((step) => ({ ...step, status: step.status === "failed" ? "failed" : "completed" })),
          results: cloneResults(event.results),
        };
      }
      return state;

    case "presenting_results":
      if (event.type === "refine_requested") {
        return { ...state, phase: "refining", refiningResultId: event.resultId ?? null };
      }
      return state;

    case "refining":
      if (event.type === "user_submitted") {
        return { ...state, error: null, phase: "understanding", prompt: event.prompt };
      }
      if (event.type === "brief_ready" || event.type === "plan_ready") return { ...state, confirmed: false, pendingDecision: { type: "execute" }, phase: "waiting_for_confirmation", plan: event.plan ?? {} };
      return state;

    case "failed":
    default:
      return state;
  }
}

function decisionRisk(decision: AgentDecision, state: AgentV5State) {
  const plan = state.plan ?? {};
  const execute = decision.type === "execute" ? decision : undefined;
  const capability = execute?.capability ?? execute?.kind;
  return {
    app: decision.type === "invoke_app" || decision.type === "execute_app" || capability === "app" || (decision.type === "execute" && decision.app === true) || Boolean(plan.app),
    batch: Boolean(execute?.batch ?? plan.batch),
    canvasWrite: Boolean(execute?.writesCanvas ?? plan.writesCanvas),
    paid: (execute?.costCredits ?? plan.costCredits ?? 0) > 0,
    skill: decision.type === "run_skill" || decision.type === "execute_skill" || capability === "skill" || (decision.type === "execute" && decision.skill === true) || Boolean(plan.skill),
  };
}

/**
 * Returns whether an action may cross the execution boundary now. This is a
 * boolean on purpose: callers still need to render their own next-step copy.
 */
export function canExecuteAgentDecision(decision: AgentDecision, state: AgentV5State): boolean {
  if (state.phase === "failed" || state.phase === "idle" || state.phase === "understanding" || state.phase === "waiting_for_choice" || state.phase === "drafting_brief") {
    return decision.type !== "execute" && decision.type !== "run_skill" && decision.type !== "execute_skill" && decision.type !== "invoke_app" && decision.type !== "execute_app";
  }

  if (decision.type !== "execute" && decision.type !== "run_skill" && decision.type !== "execute_skill" && decision.type !== "invoke_app" && decision.type !== "execute_app") return true;

  const risk = decisionRisk(decision, state);
  const policy = state.policy;
  const modeAllows = state.mode === "auto" &&
    (!risk.paid || policy.allowPaidAutoExecute) &&
    (!risk.batch || policy.allowBatchAutoExecute) &&
    (!risk.canvasWrite || policy.allowCanvasWriteAutoExecute) &&
    (!risk.skill || policy.allowSkillAutoExecute) &&
    (!risk.app || policy.allowAppAutoExecute) &&
    (!risk.paid && !risk.batch && !risk.canvasWrite && !risk.skill && !risk.app ? policy.allowSafeAutoExecute : true);

  return state.confirmed || modeAllows;
}
