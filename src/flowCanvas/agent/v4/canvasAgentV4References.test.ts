import { describe, expect, it } from "vitest";
import { collectCanvasV4ReferenceContext } from "./canvasAgentV4References";

describe("collectCanvasV4ReferenceContext", () => {
  it("collects bounded asset IDs from image nodes without transporting URLs", () => {
    expect(collectCanvasV4ReferenceContext([
      { data: { assetId: "asset-main", previewUrl: "https://example.invalid/a.png", referenceAssetItemIds: ["asset-ref", "asset-main"] } },
      { data: { assetId: "https://not-an-id" } },
      { data: { referenceAssetItemIds: ["asset-second", "", "asset-ref"] } },
    ])).toEqual([
      { assetId: "asset-main" },
      { assetId: "asset-ref" },
      { assetId: "asset-second" },
    ]);
  });

  it("limits references to sixteen stable IDs", () => {
    const nodes = Array.from({ length: 20 }, (_, index) => ({ data: { assetId: `asset-${index}` } }));
    expect(collectCanvasV4ReferenceContext(nodes)).toHaveLength(16);
  });
});
