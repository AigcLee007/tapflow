import { describe, expect, it } from "vitest";
import {
  canExecuteDecision,
  initialAgentConversationState,
  reduceAgentConversationState,
  requiresExplicitConfirmation,
} from "./agentConversationState";

describe("agent conversation state", () => {
  it("waits for explicit confirmation before paid execution", () => {
    let state = initialAgentConversationState;
    state = reduceAgentConversationState(state, { type: "plan_ready", execution: { costCredits: 3, operationCount: 1 } });
    expect(state.execution).toBe("awaiting_confirmation");
    expect(canExecuteDecision(state)).toEqual({ allowed: false, reason: "confirmation_required" });
    state = reduceAgentConversationState(state, { type: "confirmation_granted" });
    expect(canExecuteDecision(state)).toEqual({ allowed: true });
  });

  it.each([
    { kind: "batch" as const },
    { kind: "delete" as const },
    { kind: "broad_update" as const },
  ])("requires confirmation for %s", (execution) => {
    expect(requiresExplicitConfirmation(execution)).toBe(true);
  });

  it("reduces execution lifecycle and rejects stale confirmation", () => {
    let state = reduceAgentConversationState(initialAgentConversationState, { type: "plan_ready", execution: { operationCount: 1 } });
    state = reduceAgentConversationState(state, { type: "confirmation_granted" });
    state = reduceAgentConversationState(state, { type: "execution_started" });
    expect(state.execution).toBe("running");
    state = reduceAgentConversationState(state, { type: "execution_completed" });
    expect(state.execution).toBe("completed");
    expect(reduceAgentConversationState(state, { type: "confirmation_granted" })).toBe(state);
  });
});
