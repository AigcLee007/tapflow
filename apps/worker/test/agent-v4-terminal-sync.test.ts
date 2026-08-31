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

  it("merges terminal item updates without dropping successful siblings", async () => {
    const writer = {
      appendEvent: vi.fn(async () => ({ seq: 2 })),
      getTask: vi.fn(async () => ({ outputJson: { generationItems: [
        { itemId: "p1", pageKey: "main-1", prompt: "hero", referenceAssetIds: ["ref-1"], status: "succeeded", assetId: "asset-1" },
        { itemId: "p2", pageKey: "main-2", prompt: "detail", referenceAssetIds: ["ref-1"], status: "running", workflowRunId: "run-2" },
      ] } })),
      updateTask: vi.fn(async () => undefined),
    };
    await syncV4TerminalResult({ writer, tenantId: "t1", sessionId: "s1", taskId: "task", runId: "run-2", items: [{ itemId: "p2", status: "succeeded", assetId: "asset-2" }] });
    expect(writer.updateTask).toHaveBeenCalledWith(expect.objectContaining({ outputJson: expect.objectContaining({ generationItems: [
      expect.objectContaining({ itemId: "p1", pageKey: "main-1", assetId: "asset-1" }),
      expect.objectContaining({ itemId: "p2", pageKey: "main-2", assetId: "asset-2", workflowRunId: "run-2" }),
    ] }) }));
  });
});
