import { describe, expect, it } from "vitest";

import { buildSkillLaunchApprovalPlan } from "../src/modules/agent/agent-skill-approval-plan.js";

describe("Skill launch approval plan", () => {
  it("requires approval for priced text, image, and video targets", () => {
    const plan = buildSkillLaunchApprovalPlan({
      flowId: "flow-1",
      graphRevision: 4,
      nodes: [
        { id: "text-1", type: "text", priced: true },
        { id: "image-1", type: "image", priced: true },
        { id: "video-1", type: "video", priced: true },
      ],
    });

    expect(plan.requiresApproval).toBe(true);
    expect(plan.targets.map((target) => target.action)).toEqual(["text", "image", "video"]);
  });

  it("does not serialize route, provider, credential, or URL fields", () => {
    const plan = buildSkillLaunchApprovalPlan({
      flowId: "flow-1",
      graphRevision: 4,
      nodes: [{ id: "image-1", type: "image", priced: true, routeKey: "internal.line", provider: "hidden", url: "https://private.invalid" }],
    });

    expect(JSON.stringify(plan)).not.toMatch(/routeKey|provider|credential|https?:/i);
  });

  it("requires approval for a batch even when every target is unpriced", () => {
    const plan = buildSkillLaunchApprovalPlan({
      flowId: "flow-1",
      graphRevision: 4,
      nodes: [{ id: "text-1", type: "text", priced: false }, { id: "text-2", type: "text", priced: false }],
    });

    expect(plan.batch).toBe(true);
    expect(plan.requiresApproval).toBe(true);
  });
});
