import { describe, expect, it } from "vitest";

import { sanitizeFlowDraftGraph, type FlowDraftGraph } from "./flowProjectApi";

describe("sanitizeFlowDraftGraph", () => {
  it("keeps structured asset refs while stripping transient asset URLs", () => {
    const graph: FlowDraftGraph = {
      edges: [],
      nodes: [
        {
          data: {
            assetId: "asset-1",
            assetIds: ["asset-1"],
            blob: { any: true },
            downloadUrl: "https://example.test/signed-download",
            height: 768,
            mimeType: "image/png",
            naturalHeight: 768,
            naturalWidth: 1024,
            originalImageUrl: "blob:http://localhost/image",
            previewUrl: "https://example.test/signed-preview",
            source: "asset-library",
            thumbnailUrl: "https://example.test/signed-thumbnail",
            title: "Cloud asset",
            width: 1024,
          },
          id: "node-1",
          type: "image",
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    const sanitized = sanitizeFlowDraftGraph(graph);
    expect(sanitized.nodes[0]).toEqual({
      data: {
        assetId: "asset-1",
        assetIds: ["asset-1"],
        height: 768,
        mimeType: "image/png",
        naturalHeight: 768,
        naturalWidth: 1024,
        source: "asset-library",
        title: "Cloud asset",
        width: 1024,
      },
      id: "node-1",
      type: "image",
    });
  });

  it("removes data/blob/base64/file payloads before draft save", () => {
    const graph: FlowDraftGraph = {
      edges: [],
      nodes: [
        {
          data: {
            assetId: "asset-1",
            base64: "a".repeat(260),
            blob: "blob:http://localhost/image",
            file: { name: "sample.png" },
            thumbnailUrl: "data:image/png;base64,abcdef",
            title: "Cloud asset",
          },
          id: "node-1",
          type: "image",
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    expect(sanitizeFlowDraftGraph(graph).nodes[0]).toEqual({
      data: {
        assetId: "asset-1",
        title: "Cloud asset",
      },
      id: "node-1",
      type: "image",
    });
  });
});
