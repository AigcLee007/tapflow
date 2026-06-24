import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { applyCanvasAgentOps, placeAgentGeneratedAssetsOnCanvas } from "./canvasAgentOps";

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

  it("places generated asset refs as image nodes without persisted URLs", () => {
    const result = placeAgentGeneratedAssetsOnCanvas({
      assets: [
        {
          assetId: "asset-1",
          kind: "image",
          label: "Round 1 image 1",
          promptSummary: "forest sports day",
          refId: "round-1-image-1",
        },
      ],
      sessionId: "session-1",
      toolCallId: "tool-1",
      turnId: "turn-1",
    });

    expect(result.createdNodeIds).toHaveLength(1);
    const node = useFlowCanvasStore.getState().nodes[0]!;
    expect(node.data).toMatchObject({
      assetId: "asset-1",
      title: "Round 1 image 1",
    });
    expect(JSON.stringify(node.data)).not.toMatch(/https?:\/\/|data:|blob:|base64/i);
  });

  it("reuses a selected Agent auto target node for the first generated asset", () => {
    const target = useFlowCanvasStore.getState().addNode(
      "image",
      { x: 0, y: 0 },
      {
        agentMetadata: { creationStage: "agent_auto_target", productionLayer: "execution" },
        generationPrompt: "forest sports day",
        title: "Agent 图片生成",
      },
      { selected: true },
    );

    const result = placeAgentGeneratedAssetsOnCanvas({
      assets: [
        {
          assetId: "asset-1",
          kind: "image",
          label: "Round 1 image 1",
          promptSummary: "forest sports day",
          refId: "round-1-image-1",
        },
      ],
      sessionId: "session-1",
      toolCallId: "tool-1",
      turnId: "turn-1",
    });

    expect(result.createdNodeIds).toEqual([target.id]);
    expect(useFlowCanvasStore.getState().nodes).toHaveLength(1);
    expect(useFlowCanvasStore.getState().nodes[0]?.data).toMatchObject({
      assetId: "asset-1",
      generationStatus: "done",
      title: "Round 1 image 1",
    });
  });
});
