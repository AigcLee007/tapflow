import { describe, expect, it } from "vitest";

import { planOfflineCanvasAgentTurn } from "./offlineCanvasAgentPlanner";

describe("offlineCanvasAgentPlanner", () => {
  it("creates a text-to-image plan by default", () => {
    const output = planOfflineCanvasAgentTurn({
      prompt: "Help me make a forest sports day image",
      snapshot: {
        edges: [],
        flowId: "flow-1",
        nodeOutputs: {},
        nodes: [],
        projectId: "project-1",
        selectedNodeIds: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    });

    expect(output.approvalRequired).toBe(true);
    expect(output.proposedOps.map((op) => op.type)).toEqual(["add_node", "add_node", "connect_nodes"]);
    expect(output.reply.toLowerCase()).toContain("prepare");
  });

  it("creates image-to-video when a selected image exists and prompt asks for video", () => {
    const output = planOfflineCanvasAgentTurn({
      prompt: "Turn this image into a video",
      snapshot: {
        edges: [],
        flowId: "flow-1",
        nodeOutputs: {},
        nodes: [
          {
            assetId: "asset-1",
            id: "image-1",
            kind: "image",
            position: { x: 0, y: 0 },
            selected: true,
            title: "Reference Image",
          },
        ],
        projectId: "project-1",
        selectedNodeIds: ["image-1"],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    });

    expect(output.proposedOps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "video", type: "add_node" }),
        expect.objectContaining({ source: "image-1", type: "connect_nodes" }),
      ]),
    );
  });
});
