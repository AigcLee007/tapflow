import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAgentRuntime } from "./useAgentRuntime";
import type { AgentRuntimeApi } from "./agentRuntimeApi";

const contextSnapshot = { projectId: null, flowId: null, graphRevision: 0, refs: [], skillIds: [], appIds: [], modelKey: null };
const response = { sessionId: "s", turnId: "t", phase: "waiting_for_input" as const, blocks: [{ type: "understanding" as const, id: "u", text: "收到" }], contextSnapshot, pendingDecision: null, executionState: "idle" as const, replayCursor: "cursor-1", stateVersion: 1, graphRevision: 0 };

describe("canonical runtime live/replay boundary", () => {
  it("uses the authoritative session graph revision for the first turn", async () => {
    const submitTurn = vi.fn(async (_sessionId: string, input: { contextSnapshot: typeof contextSnapshot }) => ({
      ...response,
      contextSnapshot: { ...contextSnapshot, graphRevision: input.contextSnapshot.graphRevision },
      graphRevision: input.contextSnapshot.graphRevision,
    }));
    const api: AgentRuntimeApi = {
      createSession: vi.fn(async () => ({ id: "s", title: "任务", projectId: null, flowId: null, mode: "manual_confirmation" as const, graphRevision: 7 })),
      listSessions: vi.fn(async () => []), getSession: vi.fn(async () => ({ id: "s", title: "任务", projectId: null, flowId: null, mode: "manual_confirmation" as const, graphRevision: 7 })),
      getHistory: vi.fn(async () => ({ session: { id: "s", title: "任务", projectId: null, flowId: null, mode: "manual_confirmation" as const, graphRevision: 7 }, turns: [] })),
      listEvents: vi.fn(async () => ({ events: [], lastSeq: 0, replayCursor: null })),
      submitTurn, submitDecision: vi.fn(), setMode: vi.fn(), cancel: vi.fn(),
    };
    const { result } = renderHook(() => useAgentRuntime({ projectId: null, flowId: null, contextSnapshot, api }));
    await act(async () => { await result.current.submitTurn("新任务"); });
    expect(submitTurn).toHaveBeenCalledWith("s", expect.objectContaining({ contextSnapshot: expect.objectContaining({ graphRevision: 7 }) }));
  });

  it("reconnects after a dropped stream and consumes unknown events through the reducer", async () => {
    let streamCalls = 0;
    const api: AgentRuntimeApi = {
      createSession: vi.fn(async () => ({ id: "s", title: "任务", projectId: null, flowId: null, mode: "manual_confirmation" as const })),
      listSessions: vi.fn(async () => []), getSession: vi.fn(async () => ({ id: "s", title: "任务", projectId: null, flowId: null, mode: "manual_confirmation" as const })),
      getHistory: vi.fn(async () => ({ session: { id: "s", title: "任务", projectId: null, flowId: null, mode: "manual_confirmation" as const }, turns: [] })),
      listEvents: vi.fn(async () => ({ events: [], lastSeq: 0, replayCursor: null })),
      submitTurn: vi.fn(async () => response), submitDecision: vi.fn(), setMode: vi.fn(), cancel: vi.fn(),
      streamEvents: vi.fn(async (_sessionId, _input, onEvent) => { streamCalls += 1; onEvent({ id: `e-${streamCalls}`, seq: streamCalls, eventType: "future_event", event: {}, replayCursor: `cursor-${streamCalls}`, stateVersion: streamCalls, sessionId: "s", turnId: null }); throw new Error("connection dropped"); }),
    };
    const { result, unmount } = renderHook(() => useAgentRuntime({ projectId: null, flowId: null, contextSnapshot, api }));
    await act(async () => { await result.current.submitTurn("新任务"); });
    await waitFor(() => expect(streamCalls).toBeGreaterThanOrEqual(2), { timeout: 2_000 });
    expect(result.current.events[0]?.eventType).toBe("future_event");
    unmount();
  });
});
