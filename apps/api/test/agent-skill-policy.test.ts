import { describe, expect, it } from "vitest";

import { assertSkillRunTransition, canSkillRunTransition, canSkillStepTransition, canSkillApprovalTransition, requiresSkillApproval, type SkillRunStatus } from "../src/modules/agent/agent-skill-policy.js";

describe("Skill run policy", () => {
  it("allows only the durable forward transitions", () => {
    const legal: Array<[SkillRunStatus, SkillRunStatus]> = [
      ["draft", "waiting_for_input"],
      ["draft", "planned"],
      ["planned", "waiting_for_approval"],
      ["waiting_for_approval", "running"],
      ["running", "reviewing"],
      ["reviewing", "succeeded"],
      ["reviewing", "partial_success"],
    ];
    for (const [from, to] of legal) expect(canSkillRunTransition(from, to)).toBe(true);
    expect(canSkillRunTransition("succeeded", "running")).toBe(false);
    expect(() => assertSkillRunTransition("succeeded", "running")).toThrow("SKILL_RUN_INVALID_TRANSITION");
  });

  it("allows cancellation only before terminal success and never reopens a cancelled run", () => {
    expect(canSkillRunTransition("waiting_for_input", "cancelled")).toBe(true);
    expect(canSkillRunTransition("running", "cancelled")).toBe(true);
    expect(canSkillRunTransition("cancelled", "running")).toBe(false);
    expect(canSkillRunTransition("succeeded", "cancelled")).toBe(false);
  });

  it("enforces step lifecycle transitions and keeps terminal steps closed", () => {
    expect(canSkillStepTransition("pending", "running")).toBe(true);
    expect(canSkillStepTransition("running", "waiting_for_approval")).toBe(true);
    expect(canSkillStepTransition("waiting_for_approval", "running")).toBe(true);
    expect(canSkillStepTransition("running", "succeeded")).toBe(true);
    expect(canSkillStepTransition("succeeded", "running")).toBe(false);
    expect(canSkillStepTransition("cancelled", "pending")).toBe(false);
  });

  it("requires approval for priced, batch, overwrite, and delivery actions", () => {
    expect(requiresSkillApproval({ action: "analyze", priced: false })).toBe(false);
    expect(requiresSkillApproval({ action: "text", priced: true })).toBe(true);
    expect(requiresSkillApproval({ action: "image", priced: false, batch: true })).toBe(true);
    expect(requiresSkillApproval({ action: "canvas", priced: false, overwrite: true })).toBe(true);
    expect(requiresSkillApproval({ action: "deliver", priced: false })).toBe(true);
  });

  it("allows approval to move only from pending to an accepted terminal decision", () => {
    expect(canSkillApprovalTransition("not_required", "pending")).toBe(true);
    expect(canSkillApprovalTransition("pending", "approved")).toBe(true);
    expect(canSkillApprovalTransition("pending", "rejected")).toBe(true);
    expect(canSkillApprovalTransition("approved", "rejected")).toBe(false);
    expect(canSkillApprovalTransition("rejected", "approved")).toBe(false);
  });
});
