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
    expect(canExecuteDecision(state, { type: "execute" })).toBe(false);
  });

  it("walks the main conversation loop and allows active failures", () => {
    let state = reduceConversation(initialConversationState(), { type: "turn_submitted", prompt: "做一个方案" });
    state = reduceConversation(state, { type: "choice_requested", id: "direction" });
    state = reduceConversation(state, { type: "choice_submitted", id: "direction", optionIds: ["one"] });
    expect(state.phase).toBe("drafting_brief");
    state = reduceConversation(state, { type: "brief_ready", plan: { costCredits: 0 } });
    state = reduceConversation(state, { type: "confirmation_granted" });
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
