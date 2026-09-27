import { describe, expect, it } from "vitest";
import { initialAgentRuntimeState, reduceAgentEvents } from "./agentEventReducer";

describe("canonical runtime event reducer", () => {
  it("advances cursor for unknown but scope-valid events", () => {
    const state = reduceAgentEvents(initialAgentRuntimeState(), [{ id: "e-1", seq: 1, eventType: "new_future_event", event: { value: true }, replayCursor: "cursor-1", stateVersion: 1, sessionId: "session-1", turnId: null }], "cursor-1", 1);
    expect(state.lastSeq).toBe(1);
    expect(state.replayCursor).toBe("cursor-1");
    expect(state.events[0]?.eventType).toBe("new_future_event");
  });
});
