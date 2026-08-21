import { describe, expect, it } from "vitest";

import { assertSkillResultPlacement } from "../src/modules/agent/skill-result-placement.js";

describe("assertSkillResultPlacement", () => {
  it("rejects placing results into a different session or flow", () => {
    expect(() => assertSkillResultPlacement({
      run: { flowId: "flow-1", sessionId: "session-1", status: "succeeded", turnId: "turn-1" },
      input: { flowId: "flow-2", sessionId: "session-1", turnId: "turn-1" },
    })).toThrow("SKILL_RESULT_CONTEXT_MISMATCH");
  });

  it("allows completed runs and rejects runs that are still executing", () => {
    expect(() => assertSkillResultPlacement({
      run: { flowId: "flow-1", sessionId: "session-1", status: "reviewing", turnId: "turn-1" },
      input: { flowId: "flow-1", sessionId: "session-1", turnId: "turn-1" },
    })).not.toThrow();
    expect(() => assertSkillResultPlacement({
      run: { flowId: "flow-1", sessionId: "session-1", status: "running", turnId: "turn-1" },
      input: { flowId: "flow-1", sessionId: "session-1", turnId: "turn-1" },
    })).toThrow("SKILL_RESULT_NOT_READY");
  });
});
