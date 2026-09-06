import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAgentV5Session } from "./useAgentV5Session";

const sendPrompt = vi.fn().mockResolvedValue(undefined);
vi.mock("../v2/useCanvasAgentSessionV2", () => ({
  useCanvasAgentSessionV2: () => ({ messages: [{ content: "你好", id: "m1", role: "assistant" }], conversationBlocks: [], sendPrompt, workspaceState: "idle" }),
}));

describe("useAgentV5Session", () => {
  it("projects legacy messages into bounded V5 blocks and submits text", async () => {
    const { result } = renderHook(() => useAgentV5Session());
    expect(result.current.blocks).toEqual([{ type: "paragraph", text: "你好" }]);
    await act(() => result.current.submitText("设计儿童玩具"));
    expect(sendPrompt).toHaveBeenCalledWith("设计儿童玩具", { referenceContext: undefined });
  });
});
