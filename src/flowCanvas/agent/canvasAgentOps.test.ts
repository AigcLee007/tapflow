import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { applyCanvasAgentOps } from "./canvasAgentOps";

describe("applyCanvasAgentOps", () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().newProject();
  });

  it("applies add, connect, and update ops in one history-friendly batch", async () => {
    const result = await applyCanvasAgentOps({
      ops: [
        {
          clientId: "text",
          data: { text: "forest sports day", title: "Prompt" },
          kind: "text",
          position: { x: 0, y: 0 },
          type: "add_node",
        },
        {
          clientId: "image",
          data: { generationPrompt: "forest sports day", title: "Image Generation" },
          kind: "image",
          position: { x: 360, y: 0 },
          selected: true,
          type: "add_node",
        },
        {
          source: "client:text",
          sourceHandle: "out",
          target: "client:image",
          targetHandle: "in",
          type: "connect_nodes",
        },
      ],
      runNode: vi.fn(),
    });

    expect(result.ok).toBe(true);
    expect(useFlowCanvasStore.getState().nodes).toHaveLength(2);
    expect(useFlowCanvasStore.getState().edges).toHaveLength(1);
  });

  it("does not run generation when run_node is not present", async () => {
    const runNode = vi.fn();
    await applyCanvasAgentOps({
      ops: [{ data: { title: "A" }, kind: "text", position: { x: 0, y: 0 }, type: "add_node" }],
      runNode,
    });

    expect(runNode).not.toHaveBeenCalled();
  });
});
