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
  applying_canvas_ops: "更新画布",
  asset_ready: "结果已生成",
  awaiting_canvas_confirm: "确认画布操作",
  awaiting_credit_confirm: "确认积分",
  failed: "出错",
  idle: "就绪",
  plan_ready: "等待确认",
  reading_context: "读取画布",
  replay: "查看历史",
  running_workflow: "生成中",
  thinking: "规划中",
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
  if (state === "reading_context") return "正在读取画布";
  if (state === "thinking") return "正在规划下一步";
  if (state === "applying_canvas_ops") return "正在更新画布";
  if (state === "running_workflow") return "生成任务已提交";
  return null;
}
