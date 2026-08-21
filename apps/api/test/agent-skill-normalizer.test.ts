import { describe, expect, it } from "vitest";

import { normalizeSkillSource } from "../src/modules/agent/skill-normalizer.js";
import { skillSourceSchema } from "../src/modules/agent/skill-schemas.js";
import { toSkillRuntimeAction } from "../src/modules/agent/skill-types.js";

describe("skill source normalization", () => {
  it("maps persisted actions to explicit runtime operations", () => {
    expect(["analyze", "canvas", "text", "image", "video", "review", "deliver"].map((action) => toSkillRuntimeAction(action as never))).toEqual([
      "analyze", "create_canvas", "generate_text", "generate_image", "generate_video", "review", "deliver",
    ]);
  });

  it("normalizes a text Skill into executable-safe hints", () => {
    const source = skillSourceSchema.parse({
      name: "Product copy",
      summary: "Write product copy",
      usageScenarios: "商品详情页\n广告落地页",
      inputs: "产品事实\n受众",
      method: "分析卖点\n生成三版文案",
      outputs: "标题\n正文",
      askWhen: "缺少受众时追问",
      modality: "text",
    });
    const result = normalizeSkillSource(source);

    expect(result.modality).toBe("text");
    expect(result.methodSteps.map((step) => step.action)).toEqual(["analyze", "text"]);
    expect(result.inputHints).toEqual([
      { key: "input-1", label: "产品事实", required: true, kind: "text" },
      { key: "input-2", label: "受众", required: true, kind: "text" },
    ]);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an empty or overlong Skill source", () => {
    expect(() => skillSourceSchema.parse({
      name: "",
      summary: "x",
      usageScenarios: "x",
      inputs: "x",
      method: "x",
      outputs: "x",
      askWhen: "x",
      modality: "image",
    })).toThrow();
    expect(() => normalizeSkillSource({
      name: "x",
      summary: "x",
      usageScenarios: "x",
      inputs: "x",
      method: Array.from({ length: 13 }, (_, index) => `step ${index}`).join("\n"),
      outputs: "x",
      askWhen: "x",
      modality: "image",
    })).toThrow(/steps/i);
  });
});
