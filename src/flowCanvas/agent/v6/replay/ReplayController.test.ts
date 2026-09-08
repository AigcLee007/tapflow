import { describe, expect, it } from "vitest";

import { initialConversationState } from "../protocol/conversationReducer";
import type { AgentV6Response, AgentV6Scope } from "../orchestration/agentV6Api";
import { ReplayController } from "./ReplayController";

const scope: AgentV6Scope = { projectId: "project-1", flowId: "flow-1", graphRevision: 3 };
const liveResponse: AgentV6Response = {
  sessionId: "session-1",
  turnId: "turn-1",
  phase: "waiting_for_choice",
  executionState: "idle",
  mode: "manual_confirmation",
  graphRevision: 3,
  blocks: [{ type: "choice_grid", id: "direction", options: [{ id: "a", label: "方案 A" }], selectionMode: "single" }],
};

describe("Agent V6 replay controller", () => {
  it("projects live responses and durable events through the same ConversationState", () => {
    const live = new ReplayController(scope, initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 3 }));
    const replay = new ReplayController(scope, initialConversationState({ sessionId: "session-1", turnId: "turn-1", graphRevision: 3 }, { replaySeed: "history-1" }));
    const liveState = live.applyResponse(liveResponse);
    const replayState = replay.applyEvents([{ id: "event-1", seq: 1, eventType: "v6_response", eventJson: liveResponse }]);
    expect(replayState.phase).toBe(liveState.phase);
    expect(replayState.blocks).toEqual(liveState.blocks);
    expect(replayState.graphRevision).toBe(liveState.graphRevision);
    expect(replayState.pendingChoice).toEqual(liveState.pendingChoice);
  });

  it("restores history responses in order and keeps persisted mode", () => {
    const controller = new ReplayController(scope);
    const state = controller.restore({
      session: { id: "session-1", title: "历史", projectId: "project-1", flowId: "flow-1", mode: "auto" },
      responses: [
        { ...liveResponse, phase: "understanding", blocks: [{ type: "paragraph", text: "你好" }] },
        { ...liveResponse, phase: "waiting_for_choice" },
      ], lastSeq: 0, replayCursor: null,
    });
    expect(state.mode).toBe("auto");
    expect(state.phase).toBe("waiting_for_choice");
    expect(state.blocks[0]).toMatchObject({ type: "choice_grid", id: "direction" });
    expect(state.sessionId).toBe("session-1");
  });

  it("can restore a later durable snapshot without requiring earlier history rows", () => {
    const controller = new ReplayController(scope);
    const state = controller.restore({
      session: { id: "session-1", title: "历史", projectId: "project-1", flowId: "flow-1", mode: "manual_confirmation" },
      responses: [{
        ...liveResponse,
        phase: "presenting_results",
        executionState: "completed",
        blocks: [{ type: "result_group", id: "results", results: [{ id: "result-1", label: "结果" }] }],
        plan: { costCredits: 1 },
        pendingDecision: { type: "execute", decisionId: "decision-1", sessionId: "session-1", turnId: "turn-1", graphRevision: 3, payload: {}, idempotencyKey: "decision-idem", costCredits: 1 },
      }], lastSeq: 0, replayCursor: null,
    });
    expect(state.phase).toBe("presenting_results");
    expect(state.results).toEqual([{ id: "result-1", label: "结果" }]);
  });

  it("does not apply a response from a different scope or stale graph revision", () => {
    const controller = new ReplayController(scope);
    const initial = controller.state;
    expect(controller.applyResponse({ ...liveResponse, graphRevision: 2 })).toBe(initial);
    expect(controller.applyResponse({ ...liveResponse, projectId: "other-project" } as AgentV6Response & { projectId: string }).replayError).toBe("resync-required");
  });

  it("normalizes replay fields and rejects duplicate or out-of-order durable events", () => {
    const controller = new ReplayController(scope);
    const first = controller.applyEvents([{
      id: "event-1",
      seq: 1,
      eventType: "v6_response",
      eventJson: {
        ...liveResponse,
        contextSnapshot: { projectId: "project-1", flowId: "flow-1", graphRevision: 3, injected: "drop" },
        plan: { costCredits: 999999999, injected: "drop" },
        pendingDecision: { type: "execute", decisionId: "decision-1", sessionId: "session-1", turnId: "turn-1", graphRevision: 3, payload: { secret: "drop" }, idempotencyKey: "idem-1", costCredits: 1 },
        error: "e".repeat(5000),
      },
    }]);
    expect(first.replaySeq).toBe(1);
    expect(first.contextSnapshot).not.toHaveProperty("injected");
    expect(first.plan?.costCredits).toBeLessThanOrEqual(1_000_000);
    expect(first.pendingDecision?.payload).toEqual({});
    expect(first.error?.length).toBeLessThanOrEqual(4000);
    expect(controller.applyEvents([{ id: "event-1", seq: 1, eventType: "v6_response", eventJson: liveResponse }])).toBe(first);
    expect(controller.applyEvents([{ id: "event-3", seq: 3, eventType: "v6_response", eventJson: { ...liveResponse, phase: "failed" } }])).toBe(first);
  });

  it("consumes an unknown event in the valid session scope so the next valid event is not blocked", () => {
    const controller = new ReplayController(scope);
    const state = controller.applyEvents([
      { id: "event-1", seq: 1, eventType: "future_event", eventJson: { sessionId: "session-1", projectId: "project-1", flowId: "flow-1" } },
      { id: "event-2", seq: 2, eventType: "v6_response", eventJson: { ...liveResponse, phase: "waiting_for_choice" } },
    ]);

    expect(state.replaySeq).toBe(2);
    expect(state.replayCursor).toBe("event-2");
    expect(state.phase).toBe("waiting_for_choice");
    expect(state.replayError).toBeNull();
  });

  it("marks a scope-mismatched event as resync-required without blocking a later explicit resync", () => {
    const controller = new ReplayController(scope);
    const state = controller.applyEvents([
      { id: "event-1", seq: 1, eventType: "future_event", sessionId: "session-1", projectId: "other-project", flowId: "flow-1", eventJson: {} },
    ]);

    expect(state.replaySeq).toBe(0);
    expect(state.replayError).toBe("resync-required");
  });

  it("uses top-level event scope and rejects a cross-session first event without state pollution", () => {
    const controller = new ReplayController(scope, initialConversationState({ sessionId: "session-1", graphRevision: 3 }));
    const state = controller.applyEvents([{
      id: "event-1",
      seq: 1,
      eventType: "future_event",
      sessionId: "other-session",
      projectId: "project-1",
      flowId: "flow-1",
      eventJson: { response: { ...liveResponse, sessionId: "session-1" } },
    }]);

    expect(state.replaySeq).toBe(0);
    expect(state.replayCursor).toBeNull();
    expect(state.sessionId).toBe("session-1");
    expect(state.mode).toBe("manual_confirmation");
    expect(state.replayError).toBe("resync-required");
  });

  it("validates embedded response scope even when the durable event scope is valid", () => {
    const controller = new ReplayController(scope);
    const state = controller.applyEvents([{
      id: "event-1",
      seq: 1,
      eventType: "v6_response",
      sessionId: "session-1",
      projectId: "project-1",
      flowId: "flow-1",
      eventJson: { response: { ...liveResponse, sessionId: "other-session" } },
    }]);

    expect(state.replaySeq).toBe(0);
    expect(state.replayCursor).toBeNull();
    expect(state.phase).toBe("idle");
    expect(state.sessionId).toBeUndefined();
    expect(state.replayError).toBe("resync-required");
  });
});
