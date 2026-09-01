import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCanvasAgentV4Session } from "./useCanvasAgentV4Session";

const createV4TurnMock = vi.fn();
const openV4EventStreamMock = vi.fn();

vi.mock("./canvasAgentV4Api", () => ({
  createV4Turn: (...args: unknown[]) => createV4TurnMock(...args),
  openV4EventStream: (...args: unknown[]) => openV4EventStreamMock(...args),
}));

describe("useCanvasAgentV4Session", () => {
  beforeEach(() => {
    createV4TurnMock.mockReset();
    openV4EventStreamMock.mockReset();
  });

  it("fails closed when the v4 session is disabled", async () => {
    const hook = renderHook(() => useCanvasAgentV4Session({ sessionId: "s1", enabled: false }));
    await expect(hook.result.current.sendPrompt("hello")).rejects.toThrow("AGENT_V4_UNAVAILABLE");
  });

  it("deduplicates and ignores out-of-order events by sequence", async () => {
    let emit: ((event: Record<string, unknown>) => void) | undefined;
    createV4TurnMock.mockResolvedValue({ taskId: "task-1", status: "observing" });
    openV4EventStreamMock.mockImplementation((_taskId: string, _after: number, onEvent: (event: Record<string, unknown>) => void) => {
      emit = onEvent;
      return { close: vi.fn() };
    });
    const hook = renderHook(() => useCanvasAgentV4Session({ sessionId: "s1", enabled: true }));
    await act(async () => { await hook.result.current.sendPrompt("hello"); });
    act(() => {
      emit?.({ sequence: 2, type: "progress", status: "planning" });
      emit?.({ sequence: 1, type: "text", status: "observing" });
      emit?.({ sequence: 2, type: "progress", status: "planning" });
    });
    expect(hook.result.current.task?.events.map((event) => event.sequence)).toEqual([2]);
    expect(hook.result.current.task?.lastSequence).toBe(2);
  });

  it("reconnects from the latest sequence after a stream error", async () => {
    let onError: (() => void) | undefined;
    createV4TurnMock.mockResolvedValue({ taskId: "task-1", status: "observing" });
    openV4EventStreamMock.mockImplementation((_taskId: string, _after: number, onEvent: (event: Record<string, unknown>) => void, error?: () => void) => {
      onError = error;
      if (_after === 0) onEvent({ sequence: 3, type: "progress", status: "planning" });
      return { close: vi.fn() };
    });
    const hook = renderHook(() => useCanvasAgentV4Session({ sessionId: "s1", enabled: true }));
    await act(async () => { await hook.result.current.sendPrompt("hello"); });
    act(() => onError?.());
    await waitFor(() => expect(openV4EventStreamMock).toHaveBeenLastCalledWith("task-1", 3, expect.any(Function), expect.any(Function)));
  });

  it("projects worker delivery items into task progress and closes on needs_review", async () => {
    let emit: ((event: Record<string, unknown>) => void) | undefined;
    const close = vi.fn();
    createV4TurnMock.mockResolvedValue({ taskId: "task-1", status: "generating_batch" });
    openV4EventStreamMock.mockImplementation((_taskId: string, _after: number, onEvent: (event: Record<string, unknown>) => void) => {
      emit = onEvent;
      return { close };
    });
    const hook = renderHook(() => useCanvasAgentV4Session({ sessionId: "s1", enabled: true }));
    await act(async () => { await hook.result.current.sendPrompt("hello"); });
    act(() => emit?.({ sequence: 1, type: "delivery_verified", status: "needs_review", items: [
      { itemId: "main-1", status: "succeeded", assetId: "asset-1" },
      { itemId: "main-2", status: "failed", errorCode: "ASSET_WRITE_FAILED" },
    ] }));
    expect(hook.result.current.task?.generationItems).toEqual([
      { itemId: "main-1", status: "succeeded", assetId: "asset-1" },
      { itemId: "main-2", status: "failed", errorCode: "ASSET_WRITE_FAILED" },
    ]);
    expect(close).toHaveBeenCalled();
  });
});
