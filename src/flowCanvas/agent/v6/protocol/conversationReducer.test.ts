import { describe, expect, it } from "vitest";
import {
  canExecuteDecision,
  initialConversationState,
  reduceConversation,
} from "./conversationReducer";

describe("Agent V6 conversation reducer", () => {
  it("keeps an ambiguous prompt in choice state", () => {
    const state = reduceConversation(initialConversationState(), {
      type: "turn_submitted",
      prompt: "设计一个儿童陪伴玩具",
    });
    expect(state.phase).toBe("understanding");

    const next = reduceConversation(state, { type: "choice_requested", id: "direction" });
    expect(next.phase).toBe("waiting_for_choice");
  });

  it("requires confirmation for paid canvas writes", () => {
    const state = reduceConversation(initialConversationState(), {
      type: "brief_ready",
      plan: { costCredits: 12, writesCanvas: true },
    });
    expect(state.phase).toBe("waiting_for_confirmation");
    expect(canExecuteDecision(state, {
      type: "execute",
      sessionId: "session-1",
      turnId: "turn-1",
      graphRevision: 0,
      payload: {},
      idempotencyKey: "idem-1",
      costCredits: 12,
      writesCanvas: true,
    })).toBe(false);
  });

  it("tracks execution state and requires matching confirmation metadata", () => {
    let state = initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 4 });
    state = reduceConversation(state, { type: "brief_ready", decisionId: "decision-1", plan: { costCredits: 12 }, graphRevision: 4 });
    expect(state.executionState).toBe("idle");
    expect(reduceConversation(state, { type: "confirmation_granted", decisionId: "wrong", graphRevision: 4 }).phase).toBe("waiting_for_confirmation");
    expect(reduceConversation(state, { type: "confirmation_granted", decisionId: "decision-1", graphRevision: 3 }).phase).toBe("waiting_for_confirmation");
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "decision-1", graphRevision: 4 });
    expect(state.phase).toBe("executing");
    expect(state.confirmed).toBe(true);
    expect(state.executionState).toBe("running");
    expect(reduceConversation(state, { type: "execution_started" }).executionState).toBe("running");
  });

  it("rejects execution decisions whose metadata or risk differs from the confirmed plan", () => {
    let state = initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 2 });
    state = reduceConversation(state, { type: "brief_ready", decisionId: "decision-1", plan: { costCredits: 12, writesCanvas: true }, graphRevision: 2 });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "decision-1", graphRevision: 2 });
    const base = { type: "execute" as const, decisionId: "decision-1", sessionId: "session-1", turnId: "turn-1", graphRevision: 2, payload: {}, idempotencyKey: "idem-1", costCredits: 12, writesCanvas: true };
    expect(canExecuteDecision(state, { ...base, graphRevision: 3 })).toBe(false);
    expect(canExecuteDecision(state, { ...base, writesCanvas: false })).toBe(false);
    expect(canExecuteDecision(state, { ...base, costCredits: 11 })).toBe(false);
    expect(canExecuteDecision(state, base)).toBe(true);
    expect(canExecuteDecision(state, { ...base, idempotencyKey: "x".repeat(201) })).toBe(false);
    expect(canExecuteDecision(state, { ...base, payload: { prompt: "x".repeat(4_001) } })).toBe(false);
    expect(canExecuteDecision(state, { ...base, costCredits: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it("returns failed conversations to explicit retry, revise, and recover phases", () => {
    const failed = reduceConversation(
      reduceConversation(initialConversationState(), { type: "turn_submitted", prompt: "失败" }),
      { type: "turn_failed", error: "错误" },
    );
    expect(reduceConversation(failed, { type: "retry" }).phase).toBe("executing");
    expect(reduceConversation(failed, { type: "revise" }).phase).toBe("drafting_brief");
    expect(reduceConversation(failed, { type: "recover" }).phase).toBe("understanding");
  });

  it("bounds prompts, errors, context references, and rejects non-finite cost", () => {
    const long = "x".repeat(10_000);
    let state = initialConversationState({
      contextSnapshot: { projectId: long, flowId: long, selectedNodeIds: [long], assetRefs: [{ assetId: long, refId: long, label: long, nodeId: long }], uploadedAssetIds: [long], skillRefs: [{ id: long, version: 1 }], appRefs: [long], modelKey: long, graphRevision: 1 },
    });
    state = reduceConversation(state, { type: "turn_submitted", prompt: long });
    expect(state.prompt?.length).toBeLessThanOrEqual(4_000);
    state = reduceConversation(state, { type: "turn_failed", error: long });
    expect(state.error?.length).toBeLessThanOrEqual(4_000);
    expect(state.contextSnapshot.projectId?.length).toBeLessThanOrEqual(200);
    expect(state.contextSnapshot.assetRefs[0].nodeId?.length).toBeLessThanOrEqual(200);
    const planned = reduceConversation(initialConversationState(), { type: "brief_ready", plan: { costCredits: Number.NaN } });
    expect(planned.plan?.costCredits).toBeUndefined();
  });

  it("walks the main conversation loop and allows active failures", () => {
    let state = reduceConversation(initialConversationState(), { type: "turn_submitted", prompt: "做一个方案" });
    state = reduceConversation(state, { type: "choice_requested", id: "direction" });
    state = reduceConversation(state, { type: "choice_submitted", id: "direction", optionIds: ["one"] });
    expect(state.phase).toBe("drafting_brief");
    state = reduceConversation(state, { type: "brief_ready", decisionId: "decision-1", plan: { costCredits: 0 } });
    state = reduceConversation(state, { type: "confirmation_granted", decisionId: "decision-1", graphRevision: 0 });
    state = reduceConversation(state, { type: "execution_started" });
    state = reduceConversation(state, { type: "verification_started" });
    state = reduceConversation(state, { type: "results_presented" });
    expect(state.phase).toBe("presenting_results");
    state = reduceConversation(state, { type: "refinement_requested", resultId: "result-1" });
    expect(state.phase).toBe("refining");

    const failed = reduceConversation(
      reduceConversation(initialConversationState(), { type: "turn_submitted", prompt: "失败测试" }),
      { type: "turn_failed", error: "执行失败" },
    );
    expect(failed.phase).toBe("failed");
    expect(failed.error).toBe("执行失败");
  });
});
