import { describe, expect, it } from "vitest";

import { buildAgentPlannerContext } from "../src/modules/agent/agent-context-builder.js";

describe("agent context builder canvas", () => {
  it("includes selected graph context and safe node summaries", () => {
    const context = buildAgentPlannerContext({
      prompt: "Build a cat poster flow",
      snapshot: {
        edges: [
          { id: "edge-1", source: "prompt-1", target: "image-1" },
        ],
        flowId: "flow-1",
        nodeOutputs: {
          "image-1": { errorMessage: null, text: "Rendered image" },
        },
        nodes: [
          {
            assetId: "asset-1",
            id: "prompt-1",
            kind: "text",
            position: { x: 0, y: 0 },
            selected: true,
            status: "idle",
            title: "Prompt",
          },
          {
            id: "image-1",
            kind: "image",
            position: { x: 200, y: 0 },
            selected: false,
            status: "idle",
            title: "Image",
          },
        ],
        projectId: "project-1",
        selectedNodeIds: ["prompt-1"],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    });

    const parsed = JSON.parse(context) as Record<string, any>;
    expect(parsed.context.canvas.nodeCount).toBe(2);
    expect(parsed.context.selectedNodes).toEqual([
      expect.objectContaining({
        id: "prompt-1",
        kind: "text",
        title: "Prompt",
      }),
    ]);
    expect(parsed.context.upstreamNodes).toEqual([]);
    expect(parsed.context.downstreamNodes).toEqual([
      expect.objectContaining({
        id: "image-1",
        kind: "image",
        title: "Image",
      }),
    ]);
    expect(parsed.context.nodeOutputs).toEqual(expect.objectContaining({
      "image-1": expect.objectContaining({ text: "Rendered image" }),
    }));
  });
});
