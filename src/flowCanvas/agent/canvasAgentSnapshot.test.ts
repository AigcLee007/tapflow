import { describe, expect, it } from "vitest";

import { buildCanvasAgentSnapshot } from "./canvasAgentSnapshot";

describe("buildCanvasAgentSnapshot", () => {
  it("keeps asset ids and selection but removes preview and transient media urls", () => {
    const snapshot = buildCanvasAgentSnapshot({
      edges: [],
      flowId: "flow-1",
      nodeOutputs: {
        "image-1": {
          assets: [
            {
              assetId: "asset-1",
              downloadUrl: "https://signed.test/image.png",
              kind: "image",
              mimeType: "image/png",
            },
          ],
          text: null,
        },
      },
      nodes: [
        {
          data: {
            assetId: "asset-1",
            generatedResults: [{ createdAt: 1, id: "asset:asset-1", url: "data:image/png;base64,abc" }],
            kind: "image",
            originalImageUrl: "blob:http://local/image",
            status: "success",
            thumbnailUrl: "https://signed.test/image.png",
            title: "Reference",
          },
          id: "image-1",
          position: { x: 10, y: 20 },
          selected: true,
          type: "image",
        } as any,
      ],
      projectId: "project-1",
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(snapshot.selectedNodeIds).toEqual(["image-1"]);
    expect(snapshot.nodes[0]).toMatchObject({
      assetId: "asset-1",
      id: "image-1",
      kind: "image",
      selected: true,
    });
    expect(JSON.stringify(snapshot)).not.toContain("data:image");
    expect(JSON.stringify(snapshot)).not.toContain("blob:");
    expect(JSON.stringify(snapshot)).not.toContain("signed.test");
  });
});
