import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAgentConversationHistory } from "./useAgentConversationHistory";

const mockGetAgentSessionHistory = vi.fn();

vi.mock("./canvasAgentApi", () => ({
  getAgentSessionHistory: (...args: unknown[]) => mockGetAgentSessionHistory(...args),
}));

describe("useAgentConversationHistory", () => {
  beforeEach(() => {
    mockGetAgentSessionHistory.mockReset();
  });

  it("loads persisted history for a session", async () => {
    mockGetAgentSessionHistory.mockResolvedValue({
      messages: [
        { content: "鐢ㄦ埛娑堟伅", createdAt: "2026-06-24T00:00:00Z", id: "m1", role: "user" },
        { content: "Agent 鍥炲", createdAt: "2026-06-24T00:00:01Z", id: "m2", role: "assistant" },
      ],
      session: { createdAt: "2026-06-24T00:00:00Z", flowId: null, id: "session-1", projectId: null, status: "active", title: "Session 1", updatedAt: "2026-06-24T00:00:01Z" },
      turns: [{ createdAt: "2026-06-24T00:00:01Z", id: "turn-1", sessionId: "session-1", status: "planned", updatedAt: "2026-06-24T00:00:01Z" }],
    });

    const { result } = renderHook(() => useAgentConversationHistory("session-1"));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.turns).toHaveLength(1);
    expect(result.current.session?.title).toBe("Session 1");
  });
});
