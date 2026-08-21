import { describe, expect, it } from "vitest";

import { assertSkillResultPlacement } from "../src/modules/agent/skill-result-placement.js";
import { checkSkillDelivery } from "../src/modules/agent/skill-delivery-checks.js";
import { instantiateSkillGraphTemplate } from "../src/modules/agent/skill-graph-instantiator.js";
import { normalizeSkillSource } from "../src/modules/agent/skill-normalizer.js";

describe("Agent + Skill canvas contract", () => {
  it("binds a selected text Skill to a durable, delivery-checked result", () => {
    const normalized = normalizeSkillSource({
      askWhen: "受众和长度不明确时先询问",
      category: "copy",
      inputs: "主题\n受众",
      method: "分析需求\n生成文本\n检查格式",
      modality: "text",
      name: "广告文案",
      outputs: "一段可发布文案",
      summary: "生成广告文案",
      usageScenarios: "新品推广",
    });
    expect(normalized.methodSteps.map((step) => step.action)).toEqual(["analyze", "text", "review"]);

    const delivery = checkSkillDelivery({
      modality: "text",
      requirements: { textMinLength: 12 },
      run: {
        steps: [{
          action: "text",
          approvalState: "not_required",
          assetId: null,
          error: null,
          id: "step-1",
          nodeId: null,
          output: { text: "这是一段满足长度要求的广告文案。" },
          retryCount: 0,
          status: "succeeded",
          stepIndex: 0,
          workflowRunId: "workflow-1",
        }],
      },
    });
    expect(delivery.status).toBe("succeeded");
    expect(delivery.completedArtifacts).toBe(1);
  });

  it("instantiates only declarative graph templates and rejects mismatched placement context", () => {
    const instance = instantiateSkillGraphTemplate({
      schemaVersion: "v2",
      nodes: [{ data: { text: "{{topic}}" }, id: "text-1", type: "text" }],
      edges: [],
      inputBindings: { topic: { kind: "text", path: "data.text", target: "text-1" } },
    }, { topic: "春季新品" }, () => "node-new");
    expect(instance.nodes).toEqual([{ data: { text: "春季新品" }, id: "node-new", type: "text" }]);
    expect(() => assertSkillResultPlacement({
      run: { flowId: "flow-1", sessionId: "session-1", status: "succeeded", turnId: "turn-1" },
      input: { flowId: "flow-2", sessionId: "session-1", turnId: "turn-1" },
    })).toThrow("SKILL_RESULT_CONTEXT_MISMATCH");
  });
});
