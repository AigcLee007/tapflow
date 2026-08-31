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
});
