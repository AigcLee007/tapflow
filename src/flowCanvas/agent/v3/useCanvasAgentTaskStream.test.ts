import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCanvasAgentTaskStream } from "./useCanvasAgentTaskStream";

vi.mock("../canvasAgentApi", () => ({ readAgentSseStream: vi.fn(async (_response: Response, handlers: { onEvent?: (data: unknown) => void }) => handlers.onEvent?.({ taskId: "task-1", sequence: 1, type: "status", status: "succeeded" })) }));

describe("useCanvasAgentTaskStream", () => {
  it("connects with the last accepted sequence and exposes task actions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCanvasAgentTaskStream({ sessionId: "session-1", taskId: "task-1" }));
    await act(async () => { await result.current.connect(); });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("after=0");
    expect(result.current.task?.status).toBe("succeeded");
    expect(result.current.approve).toBeTypeOf("function");
    vi.unstubAllGlobals();
  });
});
