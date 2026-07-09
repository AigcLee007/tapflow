import { describe, expect, it } from "vitest";

import { assertDraftGraphSafe, FlowsApiError, normalizeDraftGraph } from "../src/modules/flows/flows.service";

describe("assertDraftGraphSafe", () => {
  it("allows asset-backed image nodes with structured metadata", () => {
    expect(() =>
      assertDraftGraphSafe({
        edges: [],
        nodes: [
          {
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
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    ).not.toThrow();
  });

  it("rejects data/blob/base64 payloads inside draft nodes", () => {
    expect(() =>
      assertDraftGraphSafe({
        edges: [],
        nodes: [
          {
            data: {
              assetId: "asset-1",
              base64: "a".repeat(260),
              thumbnailUrl: "data:image/png;base64,abcdef",
            },
            id: "node-1",
            type: "image",
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<FlowsApiError>>({
        code: "UNSUPPORTED_LOCAL_PAYLOAD",
        statusCode: 400,
      }),
    );
  });

  it("allows sourceAssetId with slice/crop metadata", () => {
    expect(() =>
      assertDraftGraphSafe({
        edges: [],
        nodes: [
          {
            data: {
              sourceAssetId: "asset-source-1",
              crop: { x: 10, y: 20, width: 300, height: 200 },
              grid: { rows: 2, cols: 2 },
              row: 0,
              col: 1,
              rows: 2,
              cols: 2,
              slice: true,
            },
            id: "node-2",
            type: "image",
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    ).not.toThrow();
  });

  it("rejects transient signed asset urls inside draft nodes", () => {
    expect(() =>
      assertDraftGraphSafe({
        edges: [],
        nodes: [
          {
            data: {
              assetId: "asset-1",
              downloadUrl: "https://example.test/object.png?X-Amz-Signature=secret",
            },
            id: "node-3",
            type: "image",
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<FlowsApiError>>({
        code: "UNSUPPORTED_LOCAL_PAYLOAD",
        statusCode: 400,
      }),
    );
  });
});

describe("normalizeDraftGraph", () => {
  it("preserves the project default director desk outside canvas nodes", () => {
    const graph = normalizeDraftGraph({
      edges: [],
      nodes: [],
      projectStudios: {
        director3d: {
          version: 1,
          scene: { gridVisible: true, units: "meters" },
          actors: [
            {
              id: "actor-1",
              kind: "placeholder_humanoid",
              locked: false,
              name: "角色 1",
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
              visible: true,
            },
          ],
          cameras: [],
          shots: [],
        },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    } as any);

    expect(graph.nodes).toEqual([]);
    expect(graph.projectStudios?.director3d?.actors[0]).toMatchObject({
      id: "actor-1",
      kind: "placeholder_humanoid",
      name: "角色 1",
    });
  });
});
