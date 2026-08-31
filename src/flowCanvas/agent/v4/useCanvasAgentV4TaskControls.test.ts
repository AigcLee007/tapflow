import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCanvasAgentV4TaskControls } from "./useCanvasAgentV4TaskControls";

describe("useCanvasAgentV4TaskControls", () => {
  it("keeps task state available for panel callbacks", () => {
    const hook = renderHook(() => useCanvasAgentV4TaskControls({ id: "task", status: "waiting_for_approval", lastSequence: 0, events: [] }));
    expect(hook.result.current.task?.status).toBe("waiting_for_approval");
    expect(typeof hook.result.current.approve).toBe("function");
  });
});
