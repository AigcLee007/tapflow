import { describe, expect, it, vi } from "vitest";

import { AgentV4RuntimeService } from "../src/modules/agent/v4/agent-v4-runtime.js";
import type { AgentV4TaskRecord, AgentV4TaskRepository } from "../src/modules/agent/v4/agent-v4-task-store.js";

describe("AgentV4RuntimeService", () => {
  it("resumes the validated pending generation after approval", async () => {
    let task: AgentV4TaskRecord | undefined;
    const repository: AgentV4TaskRepository = {
      createTask: vi.fn(async (input) => {
        task = { id: "task-1", tenantId: input.tenantId, sessionId: input.sessionId, projectId: input.projectId, flowId: input.flowId, graphRevision: input.graphRevision, prompt: input.prompt, status: input.status };
        return { id: "task-1" };
      }),
      getTask: vi.fn(async () => task ?? null),
      updateTask: vi.fn(async (_id, update) => {
        if (task) Object.assign(task, { status: update.status }, update.outputJson ? { outputJson: update.outputJson } : {});
      }),
      appendEvent: vi.fn(async () => ({ seq: 1 })),
    };
    const execute = vi.fn(async () => ({ ok: true, status: "generating_base", runIds: ["run-1"] }));
    const runtime = new AgentV4RuntimeService({
      enabled: true,
      repository,
      session: { getSession: vi.fn(async () => ({ tenantId: "tenant-1", projectId: "project-1", flowId: "flow-1" })) },
      textRuntime: {
        async *streamText() {
          yield { type: "tool_call", callId: "call-1", name: "image.generate_base", arguments: JSON.stringify({ prompt: "product hero", referenceAssetIds: ["asset-1"], nodeId: "node-1" }) };
        },
      },
      generationExecutor: execute,
    });

    const started = await runtime.startTurn({ sessionId: "session-1", context: { tenantId: "tenant-1", userId: "user-1" }, body: { prompt: "make a suite" } });
    expect(started.status).toBe("waiting_for_approval");
    await runtime.approve({ taskId: "task-1", context: { tenantId: "tenant-1", userId: "user-1" }, approved: true });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ tool: "image.generate_base", arguments: { prompt: "product hero", referenceAssetIds: ["asset-1"], nodeId: "node-1" } }));
  });

  it("relaunches only the requested failed generation item", async () => {
    const task: AgentV4TaskRecord = {
      id: "task-2", tenantId: "tenant-1", sessionId: "session-1", projectId: "project-1", flowId: "flow-1", graphRevision: 4,
      prompt: "make a suite", status: "partial_success",
      outputJson: { generationItems: [
        { itemId: "page-1", pageKey: "main-1", prompt: "hero", referenceAssetIds: ["asset-1"], nodeId: "node-1", status: "succeeded", assetId: "asset-success" },
        { itemId: "page-2", pageKey: "main-2", prompt: "detail", referenceAssetIds: ["asset-1"], nodeId: "node-2", status: "failed", errorCode: "PROVIDER_TIMEOUT" },
      ] },
    };
    const repository: AgentV4TaskRepository = {
      createTask: vi.fn(), getTask: vi.fn(async () => task), appendEvent: vi.fn(async () => ({ seq: 1 })),
      updateTask: vi.fn(async (_id, update) => { Object.assign(task, { status: update.status }, update.outputJson ? { outputJson: update.outputJson } : {}); }),
      findGenerationItem: vi.fn(async ({ itemId }) => (task.outputJson?.generationItems as Array<any>).find((item) => item.itemId === itemId) ?? null),
      updateGenerationItem: vi.fn(async ({ itemId, patch }) => {
        const item = (task.outputJson?.generationItems as Array<any>).find((candidate) => candidate.itemId === itemId);
        Object.assign(item, patch);
        return item;
      }),
    };
    const execute = vi.fn(async () => ({ ok: true, status: "generating_batch", runIds: ["run-retry-1"] }));
    const runtime = new AgentV4RuntimeService({ enabled: true, repository, session: { getSession: vi.fn() }, textRuntime: { async *streamText() {} }, generationExecutor: execute });

    await expect(runtime.retryItem({ taskId: task.id, context: { tenantId: "tenant-1", userId: "user-1" }, itemId: "page-2" })).resolves.toMatchObject({ status: "generating_batch", itemId: "page-2" });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ tool: "image.generate_batch", arguments: { items: [expect.objectContaining({ itemId: "page-2", nodeId: "node-2" })] } }));
    expect(repository.updateGenerationItem).toHaveBeenCalledWith(expect.objectContaining({ itemId: "page-2", patch: expect.objectContaining({ status: "queued", retryCount: 1 }) }));
    expect(repository.updateGenerationItem).toHaveBeenCalledWith(expect.objectContaining({ itemId: "page-2", patch: { workflowRunId: "run-retry-1", status: "running" } }));
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({ arguments: expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ itemId: "page-1" })]) }) }));
  });

  it("commits verified asset-only delivery and uses its saved inverse operations for undo", async () => {
    const task: AgentV4TaskRecord = {
      id: "task-3", tenantId: "tenant-1", sessionId: "session-1", projectId: "project-1", flowId: "flow-1", graphRevision: 4,
      prompt: "make a suite", status: "succeeded", outputJson: { generationItems: [
        { itemId: "page-1", pageKey: "main-1", prompt: "hero", referenceAssetIds: ["asset-ref"], nodeId: "node-1", status: "succeeded", assetId: "asset-1" },
      ] },
    };
    const repository: AgentV4TaskRepository = {
      createTask: vi.fn(), getTask: vi.fn(async () => task), appendEvent: vi.fn(async () => ({ seq: 1 })),
      updateTask: vi.fn(async (_id, update) => { Object.assign(task, { status: update.status }, update.outputJson ? { outputJson: update.outputJson } : {}); }),
    };
    const applyApprovedOperationSet = vi.fn()
      .mockResolvedValueOnce({ revision: 5, createdNodeIds: ["result-asset-1"], inverseOperations: [{ type: "node.delete", nodeId: "result-asset-1" }] })
      .mockResolvedValueOnce({ revision: 6, createdNodeIds: [], inverseOperations: [{ type: "node.create", node: { id: "result-asset-1", type: "image", position: { x: 0, y: 0 }, data: { assetId: "asset-1" } } }] });
    const runtime = new AgentV4RuntimeService({
      enabled: true, repository, session: { getSession: vi.fn() }, textRuntime: { async *streamText() {} },
      canvasOperations: { applyApprovedOperationSet },
    });

    await expect(runtime.commitCanvasDelivery({ taskId: task.id, context: { tenantId: "tenant-1", userId: "user-1" }, expectedRevision: 4 })).resolves.toMatchObject({ status: "succeeded", revision: 5 });
    await expect(runtime.undo({ taskId: task.id, context: { tenantId: "tenant-1", userId: "user-1" }, expectedRevision: 5 })).resolves.toMatchObject({ status: "succeeded", revision: 6 });
    expect(applyApprovedOperationSet).toHaveBeenNthCalledWith(1, expect.objectContaining({
      tenantId: "tenant-1", projectId: "project-1", flowId: "flow-1", taskId: "task-3",
      operationSet: expect.objectContaining({ baseRevision: 4, operations: [expect.objectContaining({ type: "result.place", result: expect.objectContaining({ assetId: "asset-1" }) })] }),
    }));
    expect(applyApprovedOperationSet).toHaveBeenNthCalledWith(2, expect.objectContaining({
      operationSet: expect.objectContaining({ baseRevision: 5, operations: [{ type: "node.delete", nodeId: "result-asset-1" }] }),
    }));
  });
});
