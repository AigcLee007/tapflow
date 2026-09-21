import { describe, expect, it, vi } from "vitest";
import { AgentRequirementPlanner, parseRequirementPlan } from "../src/modules/agent/runtime/agent-requirement-planner.js";

const snapshot = { projectId: "project", flowId: "flow", graphRevision: 2, refs: [], skillIds: [], appIds: [], modelKey: null };
const output = {
  understanding: "制作两张森林中的机器人图片和一份转场提示词。",
  questions: [], brief: [{ key: "subject", label: "主体", value: "森林机器人" }],
  steps: [
    { id: "first", label: "首帧", kind: "image", prompt: "机器人站在森林中，正面全身", referenceIds: [], dependsOnStepIds: [], aspectRatio: "16:9" },
    { id: "last", label: "尾帧", kind: "image", prompt: "同一机器人向镜头伸手，保留形象", referenceIds: [], dependsOnStepIds: ["first"], aspectRatio: "16:9" },
    { id: "prompt", label: "转场提示词", kind: "text", prompt: "写出从机器人站立到伸手的五秒转场提示词", referenceIds: [], dependsOnStepIds: [] },
  ],
};

describe("canonical requirement planning", () => {
  it("uses the real text runtime and carries actual answers and context into planning", async () => {
    const generateText = vi.fn().mockResolvedValue({ outputText: JSON.stringify(output) });
    const planner = new AgentRequirementPlanner({ textRuntime: { generateText }, routeKey: "server-text-route" });
    const result = await planner.plan({ tenantId: "tenant", userId: "user" }, {
      prompt: "生成首尾帧图片和视频提示词", contextSnapshot: snapshot,
      answers: { subject: "森林中的机器人", transition: "伸手", ratio: "16:9", duration: "5秒" },
      previousPlan: null, models: [{ key: "image-product", label: "画图模型", kind: "image" }],
    });
    expect(generateText).toHaveBeenCalledOnce();
    expect(generateText.mock.calls[0][1].messages[1].content).toContain("森林中的机器人");
    expect(result.steps.map((step) => step.kind)).toEqual(["image", "image", "text"]);
  });

  it("accepts a complete ordinary task without manufacturing first/last-frame questions", async () => {
    const generateText = vi.fn().mockResolvedValue({ outputText: JSON.stringify({
      ...output, understanding: "生成一张一比一咖啡海报", brief: [], steps: [
        { id: "poster", label: "咖啡海报", kind: "image", prompt: "一比一咖啡海报", referenceIds: [], dependsOnStepIds: [], aspectRatio: "1:1" },
      ],
    }) });
    const planner = new AgentRequirementPlanner({ textRuntime: { generateText }, routeKey: "text" });
    const result = await planner.plan({ tenantId: "tenant", userId: "user" }, { prompt: "一张咖啡海报", contextSnapshot: snapshot, answers: {}, previousPlan: null, models: [] });
    expect(result.questions).toEqual([]);
    expect(result.steps[0].label).toBe("咖啡海报");
  });

  it("rejects ambiguous graphs, fake references, duplicate IDs and planner-supplied routes", () => {
    const step = output.steps[0];
    for (const steps of [[step, step], [{ ...step, dependsOnStepIds: ["missing"] }], [{ ...step, referenceIds: ["fake"] }], [{ ...step, routeKey: "evil" }]]) {
      expect(() => parseRequirementPlan(JSON.stringify({ ...output, steps }), snapshot)).toThrow("AGENT_PLANNER_INVALID_OUTPUT");
    }
  });

  it("returns an explicit runtime failure rather than a fabricated successful plan", async () => {
    const planner = new AgentRequirementPlanner({ textRuntime: { generateText: vi.fn().mockRejectedValue(new Error("secret provider failure")) }, routeKey: "text" });
    await expect(planner.plan({ tenantId: "t", userId: "u" }, { prompt: "poster", contextSnapshot: snapshot, answers: {}, previousPlan: null, models: [] })).rejects.toThrow("AGENT_PLANNER_UNAVAILABLE");
  });
});
