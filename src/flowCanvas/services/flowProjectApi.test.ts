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

  it("keeps sourceAssetId with crop/grid metadata while stripping transient urls", () => {
    const graph: FlowDraftGraph = {
      edges: [],
      nodes: [
        {
          data: {
            sourceAssetId: "asset-source-1",
            crop: { x: 10, y: 12, width: 320, height: 180 },
            grid: { rows: 2, cols: 2 },
            row: 0,
            col: 1,
            rows: 2,
            cols: 2,
            slice: true,
            previewUrl: "https://example.test/image.png?X-Amz-Signature=secret",
            thumbnailUrl: "blob:http://localhost/preview",
          },
          id: "node-2",
          type: "image",
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    expect(sanitizeFlowDraftGraph(graph).nodes[0]).toEqual({
      data: {
        sourceAssetId: "asset-source-1",
        crop: { x: 10, y: 12, width: 320, height: 180 },
        grid: { rows: 2, cols: 2 },
        row: 0,
        col: 1,
        rows: 2,
        cols: 2,
        slice: true,
      },
      id: "node-2",
      type: "image",
    });
  });
});
