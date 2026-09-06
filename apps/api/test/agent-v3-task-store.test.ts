import { describe, expect, it, vi } from "vitest";
import { AgentV3TaskStore } from "../src/modules/agent/v3/agent-v3-task-store.js";

describe("AgentV3TaskStore", () => {
  it("creates a task and persists ordered V3 events", async () => {
    const repository = {
      createTask: vi.fn().mockResolvedValue({ id: "task-1" }),
      appendEvent: vi.fn().mockResolvedValue({ seq: 1 }),
      updateTask: vi.fn().mockResolvedValue(undefined),
    };
    const store = new AgentV3TaskStore(repository);
    const task = await store.create({ tenantId: "tenant-1", sessionId: "session-1", projectId: "project-1", flowId: "flow-1", prompt: "plan" });
    await store.append(task, { type: "plan", status: "planning", payload: { actions: ["inspect"] } });

    expect(task.id).toBe("task-1");
    expect(repository.createTask).toHaveBeenCalledWith(expect.objectContaining({ status: "observing", taskType: "canvas_director" }));
    expect(repository.appendEvent).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task-1", agentVersion: "v3", eventType: "plan" }));
  });
});
