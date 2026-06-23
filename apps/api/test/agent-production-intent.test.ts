import { describe, expect, it } from "vitest";

import { isProductionImageAgentPrompt } from "../src/modules/agent/agent-production-intent.js";

describe("agent production intent", () => {
  it("detects multi-model image generation comparison requests", () => {
    expect(
      isProductionImageAgentPrompt("我要生成一套对比 Nano Banana Pro 和 GPT-Image-2 生图效果的套图，需要 3 张"),
    ).toBe(true);
  });

  it("does not classify general planning requests as production image execution", () => {
    expect(isProductionImageAgentPrompt("帮我规划一下这个项目应该怎么做")).toBe(false);
  });
});

