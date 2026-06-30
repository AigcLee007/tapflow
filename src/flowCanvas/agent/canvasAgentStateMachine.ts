export type CanvasAgentWorkspaceState =
  | "idle"
  | "reading_context"
  | "thinking"
  | "plan_ready"
  | "awaiting_canvas_confirm"
  | "applying_canvas_ops"
  | "awaiting_credit_confirm"
  | "running_workflow"
  | "asset_ready"
  | "failed"
  | "replay";

export type CanvasAgentWorkspaceEvent =
  | { type: "prompt_submitted" }
  | { type: "context_ready" }
  | { type: "plan_received"; hasRunOps: boolean; requiresCreditApproval: boolean }
  | { type: "canvas_confirm_requested" }
  | { type: "canvas_confirmed" }
  | { type: "canvas_ops_applied"; hasRunOps: boolean }
  | { type: "credit_approval_required" }
  | { type: "credit_approved" }
  | { type: "workflow_started" }
  | { type: "asset_created" }
  | { type: "turn_completed" }
  | { type: "turn_failed" }
  | { type: "replay_opened" }
  | { type: "reset" };

export const CANVAS_AGENT_STATE_LABELS: Record<CanvasAgentWorkspaceState, string> = {
  applying_canvas_ops: "Writing canvas changes",
  asset_ready: "Result ready",
  awaiting_canvas_confirm: "Waiting for canvas approval",
  awaiting_credit_confirm: "Waiting for credit approval",
  failed: "Needs attention",
  idle: "Ready",
  plan_ready: "Waiting for approval",
  reading_context: "Reading canvas",
  replay: "Viewing history",
  running_workflow: "Generating",
  thinking: "Planning",
};

function isActiveState(state: CanvasAgentWorkspaceState) {
  return state !== "idle" && state !== "failed" && state !== "replay" && state !== "asset_ready";
}

export function reduceCanvasAgentWorkspaceState(
  state: CanvasAgentWorkspaceState,
  event: CanvasAgentWorkspaceEvent,
): CanvasAgentWorkspaceState {
  if (event.type === "reset") return "idle";
  if (event.type === "replay_opened") return "replay";
  if (event.type === "turn_failed" && isActiveState(state)) return "failed";

  switch (state) {
    case "idle":
      return event.type === "prompt_submitted" ? "reading_context" : state;
    case "reading_context":
      return event.type === "context_ready" ? "thinking" : state;
    case "thinking":
      if (event.type === "plan_received") {
        if (event.requiresCreditApproval) return "awaiting_credit_confirm";
        if (event.hasRunOps) return "awaiting_canvas_confirm";
        return "plan_ready";
      }
      if (event.type === "canvas_confirm_requested") return "awaiting_canvas_confirm";
      if (event.type === "credit_approval_required") return "awaiting_credit_confirm";
      if (event.type === "workflow_started") return "running_workflow";
      return state;
    case "plan_ready":
      return event.type === "canvas_confirmed" ? "applying_canvas_ops" : state;
    case "awaiting_canvas_confirm":
      if (event.type === "canvas_confirmed") return "applying_canvas_ops";
      if (event.type === "credit_approval_required") return "awaiting_credit_confirm";
      return state;
    case "applying_canvas_ops":
      if (event.type === "canvas_ops_applied") return event.hasRunOps ? "running_workflow" : "idle";
      if (event.type === "credit_approval_required") return "awaiting_credit_confirm";
      if (event.type === "workflow_started") return "running_workflow";
      return state;
    case "awaiting_credit_confirm":
      return event.type === "credit_approved" ? "running_workflow" : state;
    case "running_workflow":
      if (event.type === "asset_created") return "asset_ready";
      if (event.type === "turn_completed") return "idle";
      return state;
    case "asset_ready":
      return event.type === "turn_completed" ? "idle" : state;
    case "failed":
    case "replay":
    default:
      return state;
  }
}

export function shouldDisableCanvasAgentComposer(state: CanvasAgentWorkspaceState) {
  return (
    state === "reading_context" ||
    state === "thinking" ||
    state === "applying_canvas_ops" ||
    state === "running_workflow"
  );
}

export function isCanvasAgentBusyState(state: CanvasAgentWorkspaceState) {
  return shouldDisableCanvasAgentComposer(state);
}

export function getCanvasAgentBusyHint(state: CanvasAgentWorkspaceState) {
  if (state === "reading_context") return "Reading canvas context";
  if (state === "thinking") return "Planning editable canvas steps";
  if (state === "applying_canvas_ops") return "Writing canvas changes";
  if (state === "running_workflow") return "Generation submitted";
  return null;
}
