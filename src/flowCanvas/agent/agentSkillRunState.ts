export type AgentSkillRunStatus =
  | "draft"
  | "waiting_for_input"
  | "planned"
  | "waiting_for_approval"
  | "running"
  | "reviewing"
  | "succeeded"
  | "partial_success"
  | "failed"
  | "cancelled";

export type AgentSkillApprovalState = "not_required" | "pending" | "approved" | "rejected";

export type AgentSkillRunState = {
  approvalState: AgentSkillApprovalState;
  lastSeq: number;
  status: AgentSkillRunStatus;
};

export type AgentSkillRunEvent = {
  approvalState?: AgentSkillApprovalState;
  from: AgentSkillRunStatus;
  seq: number;
  to: AgentSkillRunStatus;
  type: "run_transition";
};

const terminal = new Set<AgentSkillRunStatus>(["succeeded", "partial_success", "failed", "cancelled"]);
const transitions: Record<AgentSkillRunStatus, ReadonlySet<AgentSkillRunStatus>> = {
  draft: new Set(["waiting_for_input", "planned", "waiting_for_approval", "cancelled", "failed"]),
  waiting_for_input: new Set(["planned", "draft", "cancelled", "failed"]),
  planned: new Set(["waiting_for_approval", "running", "cancelled", "failed"]),
  waiting_for_approval: new Set(["running", "planned", "cancelled", "failed"]),
  running: new Set(["reviewing", "succeeded", "partial_success", "failed", "cancelled"]),
  reviewing: new Set(["succeeded", "partial_success", "running", "failed", "cancelled"]),
  succeeded: new Set(),
  partial_success: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

export function createInitialAgentSkillRunState(): AgentSkillRunState {
  return { approvalState: "not_required", lastSeq: 0, status: "draft" };
}

export function canAgentSkillRunTransition(from: AgentSkillRunStatus, to: AgentSkillRunStatus): boolean {
  if (from === to) return !terminal.has(from);
  return transitions[from].has(to);
}

export function applyAgentSkillRunEvent(state: AgentSkillRunState, event: AgentSkillRunEvent): AgentSkillRunState {
  if (!Number.isInteger(event.seq) || event.seq <= state.lastSeq) return state;
  if (event.from !== state.status || !canAgentSkillRunTransition(event.from, event.to)) {
    return { ...state, lastSeq: event.seq };
  }
  return {
    approvalState: event.approvalState ?? state.approvalState,
    lastSeq: event.seq,
    status: event.to,
  };
}
