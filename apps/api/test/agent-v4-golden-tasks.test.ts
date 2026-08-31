import { describe, expect, it, vi } from "vitest";
import { agentV4GoldenTasks } from "./fixtures/agent-v4-golden-tasks.js";
import { v4ToolDefinitions, v4ToolInputSchemas } from "../src/modules/agent/v4/agent-v4-schemas.js";
import { AgentResponsesSessionService } from "../src/modules/agent/v4/agent-responses-session.service.js";

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

  it("binds every golden scenario to a registered, parseable tool contract", () => {
    const registered = new Set(v4ToolDefinitions.map((tool) => tool.name));
    for (const task of agentV4GoldenTasks) {
      expect(task.prompt.trim().length, task.id).toBeGreaterThan(0);
      for (const tool of task.expectedTools) {
        expect(registered.has(tool), `${task.id}:${tool}`).toBe(true);
        const schema = v4ToolInputSchemas[tool as keyof typeof v4ToolInputSchemas];
        expect(schema, `${task.id}:${tool} schema`).toBeTruthy();
      }
    }
  });

  it("executes the multi-round photo-to-suite planning chain with shared references", async () => {
    const calls = [
      ["reference.inspect", { referenceAssetIds: ["asset-photo"] }],
      ["product.analyze", { referenceAssetIds: ["asset-photo"], prompt: "分析商品" }],
      ["suite.plan", { prompt: "生成淘宝套图", mainImageCount: 5, detailPageCount: 8 }],
      ["visual_bible.create", { productSummary: "黑色耳机", suitePlan: { mainImageCount: 5, detailPageCount: 8, pages: [] } }],
      ["prompt_set.create", { visualBible: {}, suitePlan: { mainImageCount: 5, detailPageCount: 8, pages: [{ pageKey: "main-1", purpose: "首图" }] }, pages: [{ pageKey: "main-1", purpose: "首图" }] }],
    ] as const;
    let round = 0;
    const executed: string[] = [];
    const store = { append: vi.fn(async () => null), update: vi.fn(async () => undefined) };
    const service = new AgentResponsesSessionService({
      maxRounds: 8,
      store: store as any,
      gateway: { execute: vi.fn(async ({ call }: any) => { executed.push(call.name); return { ok: true, status: "planning", summary: call.name }; }) },
      textRuntime: { streamText: vi.fn(async function* () {
        const current = calls[round++];
        if (!current) { yield { type: "text_delta", text: "规划完成" }; return; }
        yield { type: "tool_call", callId: `call-${round}`, name: current[0], arguments: JSON.stringify(current[1]) };
      }) },
    });
    const result = await service.run({ task: { id: "task-1", tenantId: "tenant-1", sessionId: "session-1", projectId: "project-1", flowId: "flow-1", graphRevision: 0, prompt: "suite", status: "draft" }, context: { tenantId: "tenant-1", userId: "user-1" }, prompt: "suite" });
    expect(result.status).toBe("succeeded");
    expect(executed).toEqual(calls.map(([name]) => name));
    expect(store.append).toHaveBeenCalled();
  });
});
