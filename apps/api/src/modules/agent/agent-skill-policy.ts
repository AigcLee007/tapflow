export type SkillRunStatus = "draft" | "waiting_for_input" | "planned" | "waiting_for_approval" | "running" | "reviewing" | "succeeded" | "partial_success" | "failed" | "cancelled";
export type SkillStepStatus = "pending" | "running" | "waiting_for_approval" | "succeeded" | "failed" | "skipped" | "cancelled";
export type SkillApprovalState = "not_required" | "pending" | "approved" | "rejected";

const TERMINAL = new Set<SkillRunStatus>(["succeeded", "partial_success", "failed", "cancelled"]);
const TERMINAL_STEP = new Set<SkillStepStatus>(["succeeded", "failed", "skipped", "cancelled"]);
const TRANSITIONS: Record<SkillRunStatus, ReadonlySet<SkillRunStatus>> = {
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

const STEP_TRANSITIONS: Record<SkillStepStatus, ReadonlySet<SkillStepStatus>> = {
  pending: new Set(["running", "waiting_for_approval", "failed", "skipped", "cancelled"]),
  running: new Set(["waiting_for_approval", "succeeded", "failed", "cancelled"]),
  waiting_for_approval: new Set(["running", "failed", "cancelled"]),
  succeeded: new Set(),
  failed: new Set(),
  skipped: new Set(),
  cancelled: new Set(),
};

export function canSkillRunTransition(from: SkillRunStatus, to: SkillRunStatus): boolean {
  if (from === to) return !TERMINAL.has(from);
  return TRANSITIONS[from].has(to);
}

export function assertSkillRunTransition(from: SkillRunStatus, to: SkillRunStatus): void {
  if (!canSkillRunTransition(from, to)) throw new Error("SKILL_RUN_INVALID_TRANSITION");
}

export function canSkillStepTransition(from: SkillStepStatus, to: SkillStepStatus): boolean {
  if (from === to) return !TERMINAL_STEP.has(from);
  return STEP_TRANSITIONS[from].has(to);
}

export function assertSkillStepTransition(from: SkillStepStatus, to: SkillStepStatus): void {
  if (!canSkillStepTransition(from, to)) throw new Error("SKILL_STEP_INVALID_TRANSITION");
}

export function canSkillApprovalTransition(from: SkillApprovalState, to: SkillApprovalState): boolean {
  if (from === to) return true;
  if (from === "not_required") return to === "pending";
  if (from === "pending") return to === "approved" || to === "rejected";
  return false;
}

export function requiresSkillApproval(input: { action: "analyze" | "canvas" | "text" | "image" | "video" | "review" | "deliver"; batch?: boolean; overwrite?: boolean; priced: boolean }): boolean {
  return input.priced || input.batch === true || input.overwrite === true || input.action === "deliver";
}
