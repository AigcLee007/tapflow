import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCanvasAgentV4Session } from "./useCanvasAgentV4Session";

describe("useCanvasAgentV4Session", () => {
  it("fails closed when the v4 session is disabled", async () => {
    const hook = renderHook(() => useCanvasAgentV4Session({ sessionId: "s1", enabled: false }));
    await expect(hook.result.current.sendPrompt("hello")).rejects.toThrow("AGENT_V4_UNAVAILABLE");
  });
});
