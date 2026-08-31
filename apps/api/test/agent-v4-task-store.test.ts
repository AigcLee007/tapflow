import { describe, expect, it, vi } from "vitest";

import { AgentV4TaskStore, type AgentV4TaskRepository } from "../src/modules/agent/v4/agent-v4-task-store.js";

function repositoryMock() {
  const tasks = new Map<string, { id: string; tenantId: string; sessionId: string; projectId: string; flowId: string; graphRevision: number; prompt: string; status: string }>();
  const events: Array<{ seq: number; tenantId: string; taskId: string; idempotencyKey: string; eventType: string; eventJson: Record<string, unknown> }> = [];
  let seq = 0;
  const repository: AgentV4TaskRepository = {
    createTask: vi.fn(async (input) => {
      const existing = [...tasks.values()].find((task) => task.tenantId === input.tenantId && input.idempotencyKey === input.idempotencyKey);
      if (existing) return { id: existing.id };
      const id = `task-${tasks.size + 1}`;
      tasks.set(id, { id, tenantId: input.tenantId, sessionId: input.sessionId, projectId: input.projectId, flowId: input.flowId, graphRevision: input.graphRevision, prompt: input.prompt, status: input.status });
      return { id };
    }),
    appendEvent: vi.fn(async (input) => {
      const existing = events.find((event) => event.tenantId === input.tenantId && event.idempotencyKey === input.idempotencyKey);
      if (existing) return existing;
      const event = { seq: ++seq, ...input };
      events.push(event);
      return event;
    }),
    getEvents: vi.fn(async ({ tenantId, taskId, afterSeq }) => events.filter((event) => event.tenantId === tenantId && event.taskId === taskId && event.seq > afterSeq)),
    getTask: vi.fn(async ({ tenantId, taskId }) => {
      const task = tasks.get(taskId);
      return task?.tenantId === tenantId ? task : null;
    }),
    updateTask: vi.fn(async () => undefined),
    findGenerationItem: vi.fn(async () => null),
    updateGenerationItem: vi.fn(async () => undefined),
  };
  return { repository, tasks, events };
}

describe("AgentV4TaskStore", () => {
  it("returns the same task for a repeated tenant-scoped idempotency key", async () => {
    const { repository } = repositoryMock();
    const store = new AgentV4TaskStore(repository);
    const input = { tenantId: "tenant-1", sessionId: "session-1", projectId: "project-1", flowId: "flow-1", graphRevision: 3, prompt: "make a set", idempotencyKey: "turn-1" };
    const first = await store.create(input);
    const second = await store.create(input);
    expect(second.id).toBe(first.id);
    expect(repository.createTask).toHaveBeenCalledTimes(2);
  });

  it("does not duplicate an event and replays only events after afterSeq", async () => {
    const { repository } = repositoryMock();
    const store = new AgentV4TaskStore(repository);
    const task = await store.create({ tenantId: "tenant-1", sessionId: "session-1", projectId: "project-1", flowId: "flow-1", prompt: "make a set", idempotencyKey: "turn-1" });
    await store.append(task, { type: "model_turn", status: "planning", payload: { summary: "round one" }, idempotencyKey: "turn-1:round:1" });
    await store.append(task, { type: "model_turn", status: "planning", payload: { summary: "round one" }, idempotencyKey: "turn-1:round:1" });
    await store.append(task, { type: "tool_result", status: "preview_ready", payload: { assetId: "asset-1" }, idempotencyKey: "turn-1:tool:1" });
    expect(repository.appendEvent).toHaveBeenCalledTimes(3);
    await expect(store.listEvents({ tenantId: "tenant-1", taskId: task.id, afterSeq: 1 })).resolves.toEqual([expect.objectContaining({ seq: 2 })]);
    await expect(store.listEvents({ tenantId: "tenant-other", taskId: task.id, afterSeq: 0 })).resolves.toEqual([]);
  });

  it("strips provider response, credentials, and URLs from event payloads", async () => {
    const { repository } = repositoryMock();
    const store = new AgentV4TaskStore(repository);
    const task = await store.create({ tenantId: "tenant-1", sessionId: "session-1", projectId: "project-1", flowId: "flow-1", prompt: "inspect", idempotencyKey: "turn-1" });
    await store.append(task, { type: "model_turn", status: "planning", payload: { providerResponse: { secret: "no" }, summary: "safe", url: "https://private.example" }, idempotencyKey: "turn-1:round:1" });
    const persisted = (repository.appendEvent as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].eventJson;
    expect(JSON.stringify(persisted)).not.toMatch(/providerResponse|secret|private\.example/i);
    expect(persisted).toMatchObject({ summary: "safe" });
  });
});
