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
    expect(reduceCanvasAgentWorkspaceState("thinking", { type: "canvas_confirm_requested" })).toBe(
      "awaiting_canvas_confirm",
    );
    expect(reduceCanvasAgentWorkspaceState("thinking", { type: "credit_approval_required" })).toBe(
      "awaiting_credit_confirm",
    );
  });

  it("moves from plan approval to canvas application and then to workflow running", () => {
    let state: CanvasAgentWorkspaceState = "plan_ready";

    state = reduceCanvasAgentWorkspaceState(state, { type: "canvas_confirmed" });
    expect(state).toBe("applying_canvas_ops");

    state = reduceCanvasAgentWorkspaceState(state, { type: "canvas_ops_applied", hasRunOps: true });
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
    });
  });
});
