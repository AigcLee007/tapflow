import type {
  AgentConversationState,
  AgentExecutionRequirement,
  AgentExecutionState,
  ConversationEvent,
} from "./canvasAgentTypes";

export type { AgentConversationState, AgentExecutionState, ConversationEvent } from "./canvasAgentTypes";

export const initialAgentConversationState: AgentConversationState = { execution: "idle" };

type ExecutionIntent = {
  costCredits?: number;
  operationCount?: number;
  kind?: AgentExecutionRequirement;
  deleteCount?: number;
  broadUpdate?: boolean;
  isBatch?: boolean;
};

export function requiresExplicitConfirmation(intent: ExecutionIntent | AgentExecutionRequirement): boolean {
  if (typeof intent === "string") return true;
  return Boolean(
    (intent.costCredits ?? 0) > 0 ||
      (intent.operationCount ?? 0) > 1 ||
      (intent.deleteCount ?? 0) > 0 ||
      intent.broadUpdate ||
      intent.isBatch ||
      intent.kind,
  );
}

function requirementFor(intent?: ExecutionIntent): AgentExecutionRequirement | undefined {
  if (!intent) return undefined;
  if (intent.kind) return intent.kind;
  if ((intent.costCredits ?? 0) > 0) return "paid";
  if (intent.isBatch || (intent.operationCount ?? 0) > 1) return "batch";
  if ((intent.deleteCount ?? 0) > 0) return "delete";
  if (intent.broadUpdate) return "broad_update";
  return undefined;
}

export function reduceAgentConversationState(
  state: AgentConversationState,
  event: ConversationEvent,
): AgentConversationState {
  switch (event.type) {
    case "reset":
      return initialAgentConversationState;
    case "plan_ready": {
      const requirement = requirementFor(event.execution);
      return { execution: requirement ? "awaiting_confirmation" : "idle", requirement };
    }
    case "confirmation_granted":
      return state.execution === "awaiting_confirmation" ? { ...state, execution: "idle" } : state;
    case "confirmation_rejected":
      return state.execution === "awaiting_confirmation" ? { execution: "idle" } : state;
    case "execution_started":
      return state.execution === "idle" ? { ...state, execution: "running" } : state;
    case "execution_completed":
      return state.execution === "running" ? { ...state, execution: "completed" } : state;
    case "execution_failed":
      return state.execution === "running" ? { ...state, execution: "failed" } : state;
    default:
      return state;
  }
}

export function canExecuteDecision(state: AgentConversationState):
  | { allowed: true }
  | { allowed: false; reason: "confirmation_required" | "execution_in_progress" | "invalid_state" } {
  if (state.execution === "awaiting_confirmation") return { allowed: false, reason: "confirmation_required" };
  if (state.execution === "running") return { allowed: false, reason: "execution_in_progress" };
  if (state.execution === "failed" || state.execution === "completed") return { allowed: false, reason: "invalid_state" };
  return { allowed: true };
}
