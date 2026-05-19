import { describe, expect, it } from "vitest";

import { assertDraftGraphSafe, FlowsApiError } from "../src/modules/flows/flows.service";

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
});
