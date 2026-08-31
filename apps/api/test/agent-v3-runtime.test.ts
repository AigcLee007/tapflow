import { describe, expect, it, vi } from "vitest";
import { AgentV3RuntimeService, type AgentV3RuntimeAdapter } from "../src/modules/agent/v3/agent-v3-runtime.js";

describe("AgentV3RuntimeService", () => {
  it("fails closed when the V3 runtime is disabled", async () => {
    const adapter: AgentV3RuntimeAdapter = { startTurn: vi.fn() };
    const runtime = new AgentV3RuntimeService({ enabled: false, adapter });

    await expect(runtime.startTurn({ sessionId: "session-1", input: { prompt: "test" }, writeChunk: vi.fn() }))
      .rejects.toMatchObject({ code: "AGENT_V3_UNAVAILABLE", statusCode: 503 });
    expect(adapter.startTurn).not.toHaveBeenCalled();
  });

  it("delegates an enabled turn to the injected runtime adapter", async () => {
    const startTurn = vi.fn().mockResolvedValue({ taskId: "task-1", status: "planning" });
    const runtime = new AgentV3RuntimeService({ enabled: true, adapter: { startTurn } });
    const writeChunk = vi.fn();

    const result = await runtime.startTurn({ sessionId: "session-1", input: { prompt: "test" }, writeChunk });

    expect(result).toEqual({ taskId: "task-1", status: "planning" });
    expect(startTurn).toHaveBeenCalledWith({ sessionId: "session-1", input: { prompt: "test" }, writeChunk });
  });
});
