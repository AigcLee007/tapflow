import { describe, expect, it } from "vitest";

import {
  applyAgentSkillRunEvent,
  createInitialAgentSkillRunState,
  type AgentSkillRunEvent,
} from "./agentSkillRunState";

describe("agent skill run state", () => {
  it("replays legal run transitions and preserves the latest event sequence", () => {
    const events: AgentSkillRunEvent[] = [
      { seq: 1, type: "run_transition", from: "draft", to: "planned" },
      { seq: 2, type: "run_transition", from: "planned", to: "waiting_for_approval", approvalState: "pending" },
      { seq: 3, type: "run_transition", from: "waiting_for_approval", to: "running", approvalState: "approved" },
    ];
    const state = events.reduce(applyAgentSkillRunEvent, createInitialAgentSkillRunState());
    expect(state).toMatchObject({ status: "running", approvalState: "approved", lastSeq: 3 });
  });

  it("ignores duplicate or out-of-order events and never reopens a terminal run", () => {
    const initial = createInitialAgentSkillRunState();
    const planned = applyAgentSkillRunEvent(initial, { seq: 1, type: "run_transition", from: "draft", to: "planned" });
    const duplicate = applyAgentSkillRunEvent(planned, { seq: 1, type: "run_transition", from: "draft", to: "running" });
    const failed = applyAgentSkillRunEvent(duplicate, { seq: 2, type: "run_transition", from: "planned", to: "failed" });
    const reopened = applyAgentSkillRunEvent(failed, { seq: 3, type: "run_transition", from: "failed", to: "running" });
    expect(duplicate).toEqual(planned);
    expect(reopened).toMatchObject({ status: "failed", lastSeq: 3 });
  });
});
