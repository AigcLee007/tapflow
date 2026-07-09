import { describe, expect, it } from "vitest";

import { validateCanvasAgentPlan } from "./canvasAgentPolicy";

describe("validateCanvasAgentPlan", () => {
  const snapshot = {
    edges: [],
    flowId: "flow-1",
    nodeOutputs: {},
    nodes: [{ id: "image-1", kind: "image", position: { x: 0, y: 0 }, selected: true, title: "Image" }],
    projectId: "project-1",
    selectedNodeIds: ["image-1"],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as any;

  it("rejects unsupported node kinds", () => {
    const result = validateCanvasAgentPlan({
      availableRouteKeys: new Set(["image.default"]),
      output: {
        approvalRequired: true,
        evidence: [],
        plan: [],
        proposedOps: [{ data: {}, kind: "database" as any, position: { x: 0, y: 0 }, type: "add_node" }],
        reply: "plan",
      },
      snapshot,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe("UNSUPPORTED_NODE_KIND");
  });

  it.each(["storyboard", "director3d", "video_editor"] as const)(
    "accepts production suite node kind %s",
    (kind) => {
      const result = validateCanvasAgentPlan({
        availableRouteKeys: new Set(["image.default"]),
        output: {
          approvalRequired: true,
          evidence: [],
          plan: [],
          proposedOps: [{ data: {}, kind, position: { x: 0, y: 0 }, type: "add_node" }],
          reply: "plan",
        },
        snapshot,
      });

      expect(result.ok).toBe(true);
    },
  );

  it("requires approval for delete and run operations", () => {
    const result = validateCanvasAgentPlan({
      availableRouteKeys: new Set(["image.default"]),
      output: {
        approvalRequired: false,
        evidence: [],
        plan: [],
        proposedOps: [{ nodeId: "image-1", runMode: "target_node", type: "run_node" }],
        reply: "plan",
      },
      snapshot,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((item) => item.code)).toContain("APPROVAL_REQUIRED");
  });

  it("rejects route keys not present in the user-visible runtime route list", () => {
    const result = validateCanvasAgentPlan({
      availableRouteKeys: new Set(["image.default"]),
      output: {
        approvalRequired: true,
        evidence: [],
        plan: [],
        proposedOps: [{ nodeId: "image-1", patch: { routeKey: "image.hidden-provider" }, type: "update_node_data" }],
        reply: "plan",
      },
      snapshot,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe("ROUTE_NOT_VISIBLE");
  });
});
