import { describe, expect, it, vi } from "vitest";
import { approveV4Task, cancelV4Task, retryV4Item, undoV4Task } from "./canvasAgentV4Api";

describe("Canvas Agent V4 API actions", () => {
  it("posts approval, cancel, retry and undo to task-scoped endpoints", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({ ok: true, json: async () => ({ url, method: init?.method, body: init?.body }) }));
    vi.stubGlobal("fetch", fetchMock);
    await approveV4Task("task-1"); await cancelV4Task("task-1"); await retryV4Item("task-1", "item-2"); await undoV4Task("task-1", 4);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][0]).toContain("/approve");
    expect(fetchMock.mock.calls[2][1]?.body).toContain("item-2");
    vi.unstubAllGlobals();
  });
});
