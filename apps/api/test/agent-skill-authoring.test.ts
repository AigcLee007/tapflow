import { describe, expect, it } from "vitest";

import { SkillAuthoringService, parseAuthoringStructuredOutput } from "../src/modules/agent/skill-authoring.service.js";

describe("SkillAuthoringService", () => {
  it("passes a bounded sanitized canvas snapshot to the authoring model and retries one invalid JSON response", async () => {
    const prompts: string[] = [];
    let attempts = 0;
    const service = new SkillAuthoringService({
      generate: async (prompt) => {
        prompts.push(prompt);
        attempts += 1;
        return attempts === 1 ? "```json\nnot valid\n```" : JSON.stringify({
          assistantReply: "已整理",
          missingQuestions: [],
          readyToPreview: true,
          sourcePatch: { modality: "text", name: "文案 Skill", summary: "写文案", inputs: "主题", method: "分析\n写作", outputs: "正文", usageScenarios: "广告", askWhen: "缺少主题时追问" },
          validationNotes: [],
        });
      },
      repairAttempts: 1,
    });
    const result = await service.turn({
      canvasSnapshot: { nodes: [{ id: "n1", title: "x".repeat(500), text: "secret prompt" }], selectedNodeIds: ["n1"] },
      draft: {},
      sessionId: "session-1",
      userMessage: "做一个文案 Skill",
    });
    expect(result.readyToPreview).toBe(true);
    expect(attempts).toBe(2);
    expect(prompts[0]).toContain("session-1");
    expect(prompts[0]).toContain("secret prompt");
    expect(prompts[0]).not.toContain("x".repeat(500));
  });

  it("turns a user description into an editable source patch without side effects", async () => {
    const service = new SkillAuthoringService();
    const result = await service.turn({
      draft: { modality: "text", name: "", summary: "", usageScenarios: "", inputs: "", method: "", outputs: "", askWhen: "" },
      userMessage: "创建一个为电商商品写广告文案的文本 Skill，输入产品卖点，输出标题和正文",
    });

    expect(result.sourcePatch.modality).toBe("text");
    expect(result.sourcePatch.name).toContain("广告文案");
    expect(result.readyToPreview).toBe(true);
    expect(result).not.toHaveProperty("nodeOps");
    expect(result).not.toHaveProperty("workflowRun");
  });

  it("asks a focused question when the description lacks required creation information", async () => {
    const result = await new SkillAuthoringService().turn({
      draft: { modality: "image", name: "产品图", summary: "", usageScenarios: "", inputs: "", method: "", outputs: "", askWhen: "" },
      userMessage: "帮我做一个 Skill",
    });
    expect(result.readyToPreview).toBe(false);
    expect(result.missingQuestions).toContain("主要创作类型和产出是什么？");
  });

  it("accepts only the strict authoring projection and rejects provider or executable fields", () => {
    const parsed = parseAuthoringStructuredOutput(JSON.stringify({
      assistantReply: "请确认受众",
      missingQuestions: ["目标受众"],
      readyToPreview: false,
      sourcePatch: { modality: "text" },
      validationNotes: [],
    }));
    expect(parsed.readyToPreview).toBe(false);
    expect(() => parseAuthoringStructuredOutput(JSON.stringify({
      assistantReply: "bad",
      missingQuestions: [],
      readyToPreview: false,
      sourcePatch: { routeKey: "secret" },
      validationNotes: [],
    }))).toThrow(/unrecognized|validation|invalid/i);
  });

  it("repairs one fenced JSON response and then fails closed", () => {
    const result = new SkillAuthoringService().parseModelOutput(
      "```json\n{\"assistantReply\":\"ok\",\"missingQuestions\":[],\"readyToPreview\":false,\"sourcePatch\":{},\"validationNotes\":[]}\n```",
    );
    expect(result.assistantReply).toBe("ok");
    expect(() => new SkillAuthoringService().parseModelOutput("not json")).toThrow("AUTHORING_OUTPUT_INVALID");
  });
});
