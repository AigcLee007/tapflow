import { describe, expect, it, vi } from "vitest";

import { AgentResponsesSessionService } from "../src/modules/agent/v4/agent-responses-session.service.js";
import type { AgentV4TaskRecord } from "../src/modules/agent/v4/agent-v4-task-store.js";

function task(): AgentV4TaskRecord {
  return { id: "task-1", tenantId: "tenant-1", sessionId: "session-1", projectId: "project-1", flowId: "flow-1", graphRevision: 1, prompt: "create product images", status: "planning" };
}

describe("AgentResponsesSessionService", () => {
  it("runs multiple Responses rounds, executes parsed tools, and injects safe asset references", async () => {
    const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    const events: unknown[] = [];
    let round = 0;
    const textRuntime = {
      async *streamText(_context: unknown, request: { messages: Array<{ role: string; content: string }> }) {
        requests.push(request);
        round += 1;
        if (round === 1) yield { type: "tool_call", callId: "call-observe", name: "canvas.observe", arguments: "{}" };
        else if (round === 2) yield { type: "tool_call", callId: "call-plan", name: "suite.plan", arguments: JSON.stringify({ prompt: "plan" }) };
        else if (round === 3) yield { type: "tool_call", callId: "call-base", name: "image.generate_base", arguments: JSON.stringify({ prompt: "base", referenceAssetIds: ["photo-1"] }) };
        else yield { type: "text_delta", text: "done" };
        yield { type: "done", finishReason: round < 4 ? "tool_calls" : "stop" };
      },
    };
    const store = {
      append: vi.fn(async (_task: AgentV4TaskRecord, event: unknown) => events.push(event)),
    };
    const gateway = {
      execute: vi.fn(async ({ call }: { call: { name: string } }) => call.name === "image.generate_base" ? { ok: true, status: "planning", assetId: "asset-base-1", summary: "base ready" } : { ok: true, status: "planning", summary: `${call.name} done` }),
    };
    const service = new AgentResponsesSessionService({ textRuntime, store, gateway, maxRounds: 6 });
    const result = await service.run({ task: task(), context: { tenantId: "tenant-1", userId: "user-1" }, prompt: "create product images", routeKey: "text.agent" });
    expect(result.status).toBe("succeeded");
    expect(gateway.execute).toHaveBeenCalledTimes(3);
    expect(gateway.execute).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "v4:task-1:tool:call-base" }));
    expect(requests.flatMap((request) => request.messages.map((message) => message.content)).join("\n")).toContain('<ref id="round-3-image-1" assetId="asset-base-1"/>');
    expect(JSON.stringify(events)).not.toMatch(/providerResponse|https?:\/\//i);
  });

  it("fails closed with a durable event when the maximum round count is reached", async () => {
    const store = { append: vi.fn(async () => undefined) };
    const service = new AgentResponsesSessionService({
      textRuntime: { async *streamText() { yield { type: "tool_call", callId: "call-loop", name: "canvas.observe", arguments: "{}" }; } },
      store,
      gateway: { execute: vi.fn(async () => ({ ok: true, status: "planning", summary: "continue" })) },
      maxRounds: 2,
    });
    await expect(service.run({ task: task(), context: { tenantId: "tenant-1", userId: "user-1" }, prompt: "loop" })).rejects.toThrow("AGENT_V4_ROUND_LIMIT_EXCEEDED");
    expect(store.append).toHaveBeenCalledWith(expect.objectContaining({ id: "task-1" }), expect.objectContaining({ type: "error", payload: expect.objectContaining({ errorCode: "AGENT_V4_ROUND_LIMIT_EXCEEDED" }) }));
  });

  it("reassembles streamed tool-call argument deltas before schema parsing", async () => {
    const calls: unknown[] = [];
    const service = new AgentResponsesSessionService({
      textRuntime: { async *streamText() {
        yield { type: "tool_call_delta", callId: "call-1", name: "suite.plan", argumentsDelta: '{"prompt":"淘宝' };
        yield { type: "tool_call_delta", callId: "call-1", argumentsDelta: '套图"}' };
      } },
      store: { append: vi.fn(async () => undefined) },
      gateway: { execute: vi.fn(async ({ call }) => { calls.push(call); return { ok: true, status: "waiting_for_approval" }; }) },
      maxRounds: 1,
    });
    await service.run({ task: task(), context: { tenantId: "tenant-1", userId: "user-1" }, prompt: "plan" });
    expect(calls[0]).toMatchObject({ name: "suite.plan", arguments: { prompt: "淘宝套图" } });
  });

  it("returns waiting_for_continuation without starting another model round", async () => {
    let streamCalls = 0;
    const service = new AgentResponsesSessionService({
      textRuntime: { async *streamText() {
        streamCalls += 1;
        yield { type: "tool_call", callId: "call-base", name: "image.generate_base", arguments: JSON.stringify({ prompt: "base", referenceAssetIds: ["photo-1"] }) };
      } },
      store: { append: vi.fn(async () => undefined) },
      gateway: { execute: vi.fn(async () => ({ ok: true, status: "waiting_for_continuation", assetId: "asset-base" })) },
    });
    const result = await service.run({ task: task(), context: { tenantId: "tenant-1", userId: "user-1" }, prompt: "base" });
    expect(result).toMatchObject({ taskId: "task-1", status: "waiting_for_continuation", assetId: "asset-base" });
    expect(streamCalls).toBe(1);
  });

  it("persists a safe failure event when the normalized text stream errors", async () => {
    const store = { append: vi.fn(async () => undefined), update: vi.fn(async () => undefined) };
    const service = new AgentResponsesSessionService({
      textRuntime: { async *streamText() { yield { type: "error", error: { code: "PROVIDER_BAD_REQUEST", message: "provider secret https://private.example" } }; } },
      store,
      gateway: { execute: vi.fn() },
    });
    await expect(service.run({ task: task(), context: { tenantId: "tenant-1", userId: "user-1" }, prompt: "x" })).rejects.toThrow("PROVIDER_BAD_REQUEST");
    expect(store.append).toHaveBeenCalledWith(expect.objectContaining({ id: "task-1" }), expect.objectContaining({ type: "error", payload: expect.objectContaining({ errorCode: "PROVIDER_BAD_REQUEST" }) }));
    expect(JSON.stringify(store.append.mock.calls)).not.toMatch(/private\.example|provider secret/i);
    expect(store.update).toHaveBeenCalledWith(expect.objectContaining({ id: "task-1" }), expect.objectContaining({ status: "failed" }));
  });
});
