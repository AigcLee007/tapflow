import { describe, expect, it, vi } from "vitest";
import { isV4WorkflowTerminal, syncV4TerminalResult } from "../src/workflow-runtime/agent-v4-terminal-sync.js";

describe("V4 terminal sync", () => {
  it("does not consider provider-poll workflow states terminal", () => {
    expect(isV4WorkflowTerminal("running")).toBe(false);
    expect(isV4WorkflowTerminal("waiting_provider")).toBe(false);
    expect(isV4WorkflowTerminal("succeeded")).toBe(true);
    expect(isV4WorkflowTerminal("partial_success")).toBe(true);
  });

  it("projects safe terminal items idempotently", async () => {
    const writer = { appendEvent: vi.fn(async () => undefined), updateTask: vi.fn(async () => undefined) };
    const result = await syncV4TerminalResult({ writer, tenantId: "t1", sessionId: "s1", taskId: "task", runId: "run-1", items: [{ itemId: "p1", status: "succeeded", assetId: "asset-1" }, { itemId: "p2", status: "failed", errorCode: "PROVIDER_FAILED" }] });
    expect(result.status).toBe("partial_success");
    expect(JSON.stringify(writer.appendEvent.mock.calls)).not.toMatch(/https?:\/\/|providerResponse/i);
    expect(writer.appendEvent).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "v4:task:delivery:run-1" }));
  });
});
