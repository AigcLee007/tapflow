import { describe, expect, it } from "vitest";

import {
  CANVAS_AGENT_STATE_LABELS,
  reduceCanvasAgentWorkspaceState,
  type CanvasAgentWorkspaceState,
} from "./canvasAgentStateMachine";

describe("reduceCanvasAgentWorkspaceState", () => {
  it("moves from prompt submission to thinking through context loading", () => {
    let state: CanvasAgentWorkspaceState = "idle";

    state = reduceCanvasAgentWorkspaceState(state, { type: "prompt_submitted" });
    expect(state).toBe("reading_context");

    state = reduceCanvasAgentWorkspaceState(state, { type: "context_ready" });
    expect(state).toBe("thinking");
  });

  it("keeps canvas confirmation separate from credit approval", () => {
    expect(
      reduceCanvasAgentWorkspaceState("thinking", {
        type: "canvas_confirm_requested",
      }),
    ).toBe("awaiting_canvas_confirm");

    expect(
      reduceCanvasAgentWorkspaceState("thinking", {
        type: "credit_approval_required",
      }),
    ).toBe("awaiting_credit_confirm");
  });

  it("moves from plan approval to canvas application and then to workflow running", () => {
    let state: CanvasAgentWorkspaceState = "plan_ready";

    state = reduceCanvasAgentWorkspaceState(state, { type: "canvas_confirmed" });
    expect(state).toBe("applying_canvas_ops");

    state = reduceCanvasAgentWorkspaceState(state, {
      type: "canvas_ops_applied",
      hasRunOps: true,
    });
    expect(state).toBe("running_workflow");
  });

  it("returns to idle after asset creation completes the turn", () => {
    let state: CanvasAgentWorkspaceState = "running_workflow";

    state = reduceCanvasAgentWorkspaceState(state, { type: "asset_created" });
    expect(state).toBe("asset_ready");

    state = reduceCanvasAgentWorkspaceState(state, { type: "turn_completed" });
    expect(state).toBe("idle");
  });

  it("can enter replay and reset back to idle", () => {
    let state: CanvasAgentWorkspaceState = "idle";

    state = reduceCanvasAgentWorkspaceState(state, { type: "replay_opened" });
    expect(state).toBe("replay");

    state = reduceCanvasAgentWorkspaceState(state, { type: "reset" });
    expect(state).toBe("idle");
  });

  it("uses short user-facing labels for every workspace state", () => {
    expect(CANVAS_AGENT_STATE_LABELS).toMatchObject({
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
    });
  });
});
