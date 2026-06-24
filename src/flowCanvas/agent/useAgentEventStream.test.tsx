import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAgentEventStream } from "./useAgentEventStream";

const mockGetAgentSessionEvents = vi.fn();
const mockOpenAgentSessionEventStream = vi.fn();
const mockReadAgentSseStream = vi.fn();

vi.mock("./canvasAgentApi", () => ({
  getAgentSessionEvents: (...args: unknown[]) => mockGetAgentSessionEvents(...args),
  openAgentSessionEventStream: (...args: unknown[]) => mockOpenAgentSessionEventStream(...args),
  readAgentSseStream: (...args: unknown[]) => mockReadAgentSseStream(...args),
}));

describe("useAgentEventStream", () => {
  beforeEach(() => {
    mockGetAgentSessionEvents.mockReset();
    mockOpenAgentSessionEventStream.mockReset();
    mockReadAgentSseStream.mockReset();
  });

  it("replays prior events and merges live events without duplicates", async () => {
    mockGetAgentSessionEvents.mockResolvedValue({
      events: [
        { createdAt: "2026-06-24T00:00:00Z", eventJson: { label: "planning" }, eventType: "thinking_status", id: "e1", seq: 1, sessionId: "session-1", taskId: null, turnId: "turn-1" },
      ],
    });
    mockOpenAgentSessionEventStream.mockResolvedValue({ ok: true, status: 200 });
    mockReadAgentSseStream.mockImplementation(async (_response, handlers) => {
      handlers.onEvent?.({
        createdAt: "2026-06-24T00:00:01Z",
        eventJson: { label: "executing" },
        eventType: "task_started",
        id: "e2",
        seq: 2,
        sessionId: "session-1",
        taskId: "task-1",
        turnId: "turn-1",
      });
      handlers.onEvent?.({
        createdAt: "2026-06-24T00:00:01Z",
        eventJson: { label: "executing" },
        eventType: "task_started",
        id: "e2",
        seq: 2,
        sessionId: "session-1",
        taskId: "task-1",
        turnId: "turn-1",
      });
    });

    const { result } = renderHook(() => useAgentEventStream("session-1"));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.events).toHaveLength(2);
    expect(result.current.events.map((event) => event.seq)).toEqual([1, 2]);
  });
});
