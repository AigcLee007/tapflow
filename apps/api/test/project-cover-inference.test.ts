import { describe, expect, test } from "vitest";

import { inferProjectCoverAssetIdFromDraftGraph } from "../src/modules/projects/projects.service.js";

describe("inferProjectCoverAssetIdFromDraftGraph", () => {
  test("prefers the first generated image asset over uploaded image assets", () => {
    expect(
      inferProjectCoverAssetIdFromDraftGraph({
        nodes: [
          {
            id: "upload-1",
            type: "upload",
            data: {
              assetId: "uploaded-asset",
              kind: "upload",
              mimeType: "image/png",
            },
          },
          {
            id: "image-1",
            type: "image",
            data: {
              generatedResults: [
                { id: "asset:generated-asset-1", url: "https://example.test/generated-1.png" },
                { id: "asset:generated-asset-2", url: "https://example.test/generated-2.png" },
              ],
              kind: "image",
            },
          },
        ],
      }),
    ).toBe("generated-asset-1");
  });

  test("falls back to the first uploaded image asset", () => {
    expect(
      inferProjectCoverAssetIdFromDraftGraph({
        nodes: [
          {
            id: "upload-1",
            type: "upload",
            data: {
              assetId: "uploaded-asset",
              kind: "upload",
              mimeType: "image/png",
            },
          },
        ],
      }),
    ).toBe("uploaded-asset");
  });

  test("returns null when the canvas has no durable image asset", () => {
    expect(
      inferProjectCoverAssetIdFromDraftGraph({
        nodes: [{ id: "text-1", type: "text", data: { kind: "text", text: "hello" } }],
      }),
    ).toBeNull();
  });
});
