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
      ],
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
      }],
    });
    expect(state.phase).toBe("presenting_results");
    expect(state.results).toEqual([{ id: "result-1", label: "结果" }]);
  });

  it("does not apply a response from a different scope or stale graph revision", () => {
    const controller = new ReplayController(scope);
    const initial = controller.state;
    expect(controller.applyResponse({ ...liveResponse, graphRevision: 2 })).toBe(initial);
    expect(controller.applyResponse({ ...liveResponse, projectId: "other-project" } as AgentV6Response & { projectId: string })).toBe(initial);
  });
});
