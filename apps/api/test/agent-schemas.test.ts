import { describe, expect, it } from "vitest";

import { createAgentTurnSchema } from "../src/modules/agent/agent.schemas.js";

const validSnapshot = {
  edges: [],
  flowId: null,
  nodeOutputs: {},
  nodes: [],
  projectId: null,
  selectedNodeIds: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

describe("createAgentTurnSchema", () => {
  it("accepts valid referenceContext", () => {
    const parsed = createAgentTurnSchema.parse({
      prompt: "Use the reference image",
      referenceContext: {
        items: [
          {
            assetId: "asset-1",
            kind: "artifact",
            label: "Reference image 1",
            refId: "ref-1",
          },
          {
            assetId: "asset-2",
            kind: "canvas_node",
            label: "Reference image 2",
            nodeId: "node-2",
            refId: "ref-2",
          },
        ],
      },
      snapshot: validSnapshot,
    });

    expect(parsed.referenceContext?.items).toEqual([
      expect.objectContaining({
        assetId: "asset-1",
        kind: "artifact",
        label: "Reference image 1",
        refId: "ref-1",
      }),
      expect.objectContaining({
        assetId: "asset-2",
        kind: "canvas_node",
        label: "Reference image 2",
        nodeId: "node-2",
        refId: "ref-2",
      }),
    ]);
  });

  it("rejects more than 8 references", () => {
    const result = createAgentTurnSchema.safeParse({
      prompt: "Use these references",
      referenceContext: {
        items: Array.from({ length: 9 }, (_, index) => ({
          assetId: `asset-${index + 1}`,
          kind: "upload",
          label: `Reference image ${index + 1}`,
          refId: `ref-${index + 1}`,
        })),
      },
      snapshot: validSnapshot,
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate refId values", () => {
    const result = createAgentTurnSchema.safeParse({
      prompt: "Use these references",
      referenceContext: {
        items: [
          {
            assetId: "asset-1",
            kind: "artifact",
            label: "Reference image 1",
            refId: "duplicate-ref",
          },
          {
            assetId: "asset-2",
            kind: "upload",
            label: "Reference image 2",
            refId: "duplicate-ref",
          },
        ],
      },
      snapshot: validSnapshot,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        message: "referenceContext.items must use unique refId values",
        path: ["referenceContext", "items", 1, "refId"],
      }),
    );
  });
});
