import { describe, expect, test, vi } from "vitest";

import { AgentEventService } from "../src/modules/agent/agent-event.service.js";

describe("AgentEventService", () => {
  test("persists task_created events with durable task ids", async () => {
    const appendSessionEvent = vi.fn(async (_context, input) => ({
      createdAt: "2026-06-24T00:00:00.000Z",
      eventJson: input.eventJson,
      eventType: input.eventType,
      id: "event-1",
      seq: 1,
      sessionId: input.sessionId,
      taskId: input.taskId ?? null,
      turnId: input.turnId ?? null,
    }));
    const service = new AgentEventService({
      pool: {} as never,
      repository: {
        appendSessionEvent,
        getSessionEvents: vi.fn(),
      },
    });

    await service.appendToolEvent(
      { tenantId: "tenant-1", userId: "user-1" },
      "session-1",
      {
        taskId: "task-1",
        title: "Image generation",
        toolCallKey: "tool-1",
        toolName: "generate_image",
        type: "task_created",
      },
    );

    expect(appendSessionEvent).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: "user-1" },
      expect.objectContaining({
        eventJson: {
          taskId: "task-1",
          title: "Image generation",
          toolCallKey: "tool-1",
          toolName: "generate_image",
        },
        eventType: "task_created",
        sessionId: "session-1",
        taskId: "task-1",
      }),
    );
  });

  test("persists artifact_created events with asset refs and task ids", async () => {
    const appendSessionEvent = vi.fn(async (_context, input) => ({
      createdAt: "2026-06-24T00:00:00.000Z",
      eventJson: input.eventJson,
      eventType: input.eventType,
      id: "event-2",
      seq: 2,
      sessionId: input.sessionId,
      taskId: input.taskId ?? null,
      turnId: input.turnId ?? null,
    }));
    const service = new AgentEventService({
      pool: {} as never,
      repository: {
        appendSessionEvent,
        getSessionEvents: vi.fn(),
      },
    });

    await service.appendToolEvent(
      { tenantId: "tenant-1", userId: "user-1" },
      "session-1",
      {
        assetRef: {
          assetId: "asset-1",
          kind: "image",
          label: "Generated image",
          refId: "asset-ref-1",
        },
        taskId: "task-1",
        toolCallKey: "tool-1",
        type: "artifact_created",
      },
    );

    expect(appendSessionEvent).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: "user-1" },
      expect.objectContaining({
        eventJson: {
          assetRef: {
            assetId: "asset-1",
            kind: "image",
            label: "Generated image",
            refId: "asset-ref-1",
          },
          taskId: "task-1",
          toolCallKey: "tool-1",
        },
        eventType: "artifact_created",
        sessionId: "session-1",
        taskId: "task-1",
      }),
    );
  });

  test("does not persist transient thinking or message delta events", async () => {
    const appendSessionEvent = vi.fn();
    const service = new AgentEventService({
      pool: {} as never,
      repository: {
        appendSessionEvent,
        getSessionEvents: vi.fn(),
      },
    });

    await service.appendToolEvent(
      { tenantId: "tenant-1", userId: "user-1" },
      "session-1",
      { content: "Thinking...", type: "message_delta" },
    );
    await service.appendToolEvent(
      { tenantId: "tenant-1", userId: "user-1" },
      "session-1",
      { detail: "Planning next step", label: "Thinking", type: "thinking_status" },
    );

    expect(appendSessionEvent).not.toHaveBeenCalled();
  });
});
