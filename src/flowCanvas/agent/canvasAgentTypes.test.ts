import { describe, expect, it } from "vitest";

import { getCanvasAgentOpPermission, summarizeCanvasAgentOps } from "./canvasAgentTypes";

describe("canvasAgentTypes", () => {
  it("summarizes canvas ops without exposing internal route keys", () => {
    const summary = summarizeCanvasAgentOps([
      {
        data: { routeKey: "image.mouxihub.nano-banana-pro.t3" },
        kind: "image",
        position: { x: 100, y: 100 },
        type: "add_node",
      },
      { source: "text-1", target: "image-1", type: "connect_nodes" },
      { nodeId: "image-1", runMode: "target_node", type: "run_node" },
    ]);

    expect(summary).toEqual({
      addNodeCount: 1,
      connectCount: 1,
      creditRunCount: 1,
      deleteEdgeCount: 0,
      deleteNodeCount: 0,
      updateNodeCount: 0,
    });
    expect(JSON.stringify(summary)).not.toContain("mouxihub");
  });

  it("classifies write and credit operations", () => {
    expect(
      getCanvasAgentOpPermission({
        data: {},
        kind: "text",
        position: { x: 0, y: 0 },
        type: "add_node",
      }),
    ).toBe("safe_write");
    expect(getCanvasAgentOpPermission({ nodeIds: ["a"], type: "delete_nodes" })).toBe("confirmed_write");
    expect(
      getCanvasAgentOpPermission({
        nodeId: "a",
        runMode: "target_node",
        type: "run_node",
      }),
    ).toBe("credit_required");
  });
});
