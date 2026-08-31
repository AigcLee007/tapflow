import { describe, expect, it, vi } from "vitest";
import { AgentV4ToolGateway } from "../src/modules/agent/v4/agent-v4-tool-gateway.js";
import type { AgentV4TaskRecord } from "../src/modules/agent/v4/agent-v4-task-store.js";

const task = (status: AgentV4TaskRecord["status"] = "planning"): AgentV4TaskRecord => ({ id: "t1", tenantId: "tenant-1", sessionId: "s1", projectId: "p1", flowId: "f1", graphRevision: 2, prompt: "淘宝套图", status });

describe("AgentV4ToolGateway", () => {
  it("validates tenant and tool arguments before invoking a handler", async () => {
    const handler = vi.fn(async () => ({ ok: true, summary: "分析完成", providerResponse: "hidden" }));
    const gateway = new AgentV4ToolGateway({ handlers: { "product.analyze": handler } });
    const result = await gateway.execute({ task: task(), context: { tenantId: "tenant-1", userId: "u1" }, call: { name: "product.analyze", callId: "c1", arguments: { referenceAssetIds: ["asset-1"] } }, idempotencyKey: "k1" });
    expect(result).toMatchObject({ ok: true, summary: "分析完成" });
    expect(JSON.stringify(result)).not.toMatch(/providerResponse|hidden/i);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("fails closed for cross-tenant calls and gates paid tools on approval", async () => {
    const handler = vi.fn(async () => ({ ok: true, assetId: "asset-1" }));
    const gateway = new AgentV4ToolGateway({ handlers: { "image.generate_base": handler } });
    const waiting = await gateway.execute({ task: task(), context: { tenantId: "tenant-1", userId: "u1" }, call: { name: "image.generate_base", callId: "c1", arguments: { prompt: "base", referenceAssetIds: ["a1"] } }, idempotencyKey: "k1" });
    expect(waiting).toMatchObject({ ok: false, status: "waiting_for_approval", errorCode: "AGENT_V4_APPROVAL_REQUIRED" });
    expect(handler).not.toHaveBeenCalled();
    await expect(gateway.execute({ task: task("waiting_for_approval"), context: { tenantId: "other", userId: "u1" }, call: { name: "image.generate_base", callId: "c2", arguments: { prompt: "base", referenceAssetIds: ["a1"] } }, idempotencyKey: "k2" })).rejects.toThrow("AGENT_V4_TENANT_MISMATCH");
  });
});
