import { describe, expect, it, vi } from "vitest";
import { approveV4Task, cancelV4Task, openV4EventStream, retryV4Item, undoV4Task } from "./canvasAgentV4Api";
import { setStoredTokens } from "../../../services/v2HttpClient";

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

  it("opens an authorized fetch SSE stream and forwards events", async () => {
    setStoredTokens({ accessToken: "access-token" });
    const fetchMock = vi.fn(async () => new Response("event: event\ndata: {\"sequence\":1,\"type\":\"progress\"}\n\n"));
    vi.stubGlobal("fetch", fetchMock);
    const onEvent = vi.fn();
    const stream = openV4EventStream("task-1", 4, onEvent);
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledWith({ sequence: 1, type: "progress" }));
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer access-token" });
    stream.close();
    vi.unstubAllGlobals();
    setStoredTokens({ accessToken: null, refreshToken: null });
  });
});
