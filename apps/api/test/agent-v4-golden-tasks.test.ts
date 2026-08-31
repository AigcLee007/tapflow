import { describe, expect, it } from "vitest";
import { agentV4GoldenTasks } from "./fixtures/agent-v4-golden-tasks.js";

describe("Agent V4 Golden Tasks", () => {
  it("covers the required Taobao, approval, retry, injection, and replay flows", () => {
    expect(agentV4GoldenTasks).toHaveLength(8);
    expect(new Set(agentV4GoldenTasks.map((task) => task.id)).size).toBe(8);
    expect(agentV4GoldenTasks.find((task) => task.id === "taobao-suite-from-photo")?.expectedTools).toContain("image.generate_batch");
    expect(agentV4GoldenTasks.map((task) => task.id)).toEqual(expect.arrayContaining([
      "base-to-batch-consistency", "continue-generation-reference", "provider-success-asset-write-failure",
      "fail-closed-billing", "injection-resistance",
    ]));
  });
});
