import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCanvasAgentV4TaskControls } from "./useCanvasAgentV4TaskControls";

vi.mock("./canvasAgentV4Api", () => ({
  approveV4Task: vi.fn(async () => ({ status: "generating_base" })),
  cancelV4Task: vi.fn(async () => ({ status: "cancelled" })),
  retryV4Item: vi.fn(async () => ({ status: "generating_batch", itemId: "page-2", itemStatus: "running", retryCount: 1 })),
  undoV4Task: vi.fn(async () => ({ status: "succeeded", revision: 6 })),
}));

describe("useCanvasAgentV4TaskControls", () => {
  it("keeps task state available for panel callbacks", () => {
    const hook = renderHook(() => useCanvasAgentV4TaskControls({ id: "task", status: "waiting_for_approval", lastSequence: 0, events: [] }));
    expect(hook.result.current.task?.status).toBe("waiting_for_approval");
    expect(typeof hook.result.current.approve).toBe("function");
  });

  it("tracks a task created after the session starts", async () => {
    const hook = renderHook(({ task }) => useCanvasAgentV4TaskControls(task), { initialProps: { task: undefined as any } });
    hook.rerender({ task: { id: "task-2", status: "planning", lastSequence: 1, events: [] } });
    await waitFor(() => expect(hook.result.current.task?.id).toBe("task-2"));
  });

  it("merges retry response into the matching generation item", async () => {
    const hook = renderHook(() => useCanvasAgentV4TaskControls({
      id: "task-3",
      status: "partial_success",
      lastSequence: 2,
      events: [],
      generationItems: [
        { itemId: "page-1", status: "succeeded", assetId: "asset-1" },
        { itemId: "page-2", status: "failed", errorCode: "TIMEOUT" },
      ],
    }));

    await hook.result.current.retry("page-2");

    await waitFor(() => expect(hook.result.current.task).toMatchObject({
      status: "generating_batch",
      generationItems: [
        { itemId: "page-1", status: "succeeded", assetId: "asset-1" },
        { itemId: "page-2", status: "running", retryCount: 1 },
      ],
    }));
  });
});
