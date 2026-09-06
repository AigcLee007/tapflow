import { describe, expect, it } from "vitest";

import {
  canExecuteAgentDecision,
  initialAgentV5State,
  reduceAgentV5State,
} from "./agentV5State";

describe("agent V5 state", () => {
  it("keeps an ambiguous first request in understanding and then waits for a choice", () => {
    const state = reduceAgentV5State(initialAgentV5State(), {
      type: "user_submitted",
      prompt: "根据这张小黄人图片设计儿童陪伴玩具",
    });

    expect(state.phase).toBe("understanding");

    const next = reduceAgentV5State(state, {
      type: "agent_asked_question",
      questionId: "direction",
    });

    expect(next.phase).toBe("waiting_for_choice");
    expect(next.pendingQuestionId).toBe("direction");
  });

  it("requires confirmation before a paid or canvas-writing decision", () => {
    const state = reduceAgentV5State(initialAgentV5State(), {
      type: "brief_ready",
      plan: { costCredits: 12, writesCanvas: true, batch: false },
    });

    expect(state.phase).toBe("waiting_for_confirmation");
    expect(canExecuteAgentDecision({ type: "execute" }, state)).toBe(false);

    const confirmed = reduceAgentV5State(state, { type: "confirmation_granted" });
    expect(confirmed.phase).toBe("executing");
    expect(canExecuteAgentDecision({ type: "execute" }, confirmed)).toBe(true);
  });

  it("walks a confirmed run through results and refinement", () => {
    let state = initialAgentV5State();
    state = reduceAgentV5State(state, { type: "user_submitted", prompt: "整理一个产品 Brief" });
    state = reduceAgentV5State(state, { type: "brief_ready", plan: { costCredits: 0 } });
    state = reduceAgentV5State(state, { type: "confirmation_granted" });
    state = reduceAgentV5State(state, { type: "execution_completed", results: [{ id: "r1", label: "方案一" }] });
    expect(state.phase).toBe("presenting_results");
    expect(state.results).toEqual([{ id: "r1", label: "方案一" }]);

    state = reduceAgentV5State(state, { type: "refine_requested", resultId: "r1" });
    expect(state.phase).toBe("refining");
    expect(state.refiningResultId).toBe("r1");
  });

  it("can fail from an active phase and reset to idle", () => {
    const understanding = reduceAgentV5State(initialAgentV5State(), {
      type: "user_submitted",
      prompt: "做一个方案",
    });
    const failed = reduceAgentV5State(understanding, { type: "turn_failed", error: "暂时无法执行" });
    expect(failed.phase).toBe("failed");
    expect(failed.error).toBe("暂时无法执行");
    expect(reduceAgentV5State(failed, { type: "reset" }).phase).toBe("idle");
  });

  it("does not reuse confirmation after execution and honors explicit confirmation", () => {
    let state = initialAgentV5State({ mode: "auto", policy: { allowSafeAutoExecute: true } });
    state = reduceAgentV5State(state, { type: "user_submitted", prompt: "做一个方案" });
    state = reduceAgentV5State(state, { type: "brief_ready", plan: { costCredits: 3 } });
    state = reduceAgentV5State(state, { type: "confirmation_granted" });
    state = reduceAgentV5State(state, { type: "execution_completed", results: [] });
    expect(state.confirmed).toBe(false);
    expect(canExecuteAgentDecision({ type: "execute", costCredits: 3 }, { ...state, phase: "waiting_for_confirmation" })).toBe(false);
    expect(canExecuteAgentDecision({ type: "execute", requiresConfirmation: true }, { ...state, phase: "waiting_for_confirmation" })).toBe(false);
  });

  it("ignores mismatched or empty choice events", () => {
    let state = reduceAgentV5State(initialAgentV5State(), { type: "user_submitted", prompt: "做一个方案" });
    state = reduceAgentV5State(state, { type: "agent_asked_question", questionId: "direction" });
    expect(reduceAgentV5State(state, { type: "choice_submitted", questionId: "other", optionIds: ["x"] }).phase).toBe("waiting_for_choice");
    expect(reduceAgentV5State(state, { type: "choice_submitted", questionId: "direction", optionIds: [] }).phase).toBe("waiting_for_choice");
  });
});
