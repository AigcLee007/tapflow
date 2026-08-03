import { describe, expect, it } from "vitest";

import { signedAssetUrlRequestSchema } from "../src/modules/assets/assets.schemas.js";

const assetId = "8d9e7ca2-8db8-4523-9592-4c7460aa1a5b";

describe("signedAssetUrlRequestSchema", () => {
  it("defaults omitted variant fallback to false", () => {
    const parsed = signedAssetUrlRequestSchema.parse({
      requests: [{ assetId }],
    });

    expect(parsed.requests[0]).toEqual({
      allowVariantFallback: false,
      assetId,
    });
  });

  it("accepts thumb variants when fallback is enabled", () => {
    const parsed = signedAssetUrlRequestSchema.parse({
      requests: [{ allowVariantFallback: true, assetId, variantKey: "thumb" }],
    });

    expect(parsed.requests[0]).toEqual({
      allowVariantFallback: true,
      assetId,
      variantKey: "thumb",
    });
  });

  it("accepts preview variants when fallback is enabled", () => {
    const parsed = signedAssetUrlRequestSchema.parse({
      requests: [{ allowVariantFallback: true, assetId, variantKey: "preview" }],
    });

    expect(parsed.requests[0]).toEqual({
      allowVariantFallback: true,
      assetId,
      variantKey: "preview",
    });
  });

  it("rejects unknown variants", () => {
    const result = signedAssetUrlRequestSchema.safeParse({
      requests: [{ assetId, variantKey: "full-resolution" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects more than 100 signed URL requests", () => {
    const result = signedAssetUrlRequestSchema.safeParse({
      requests: Array.from({ length: 101 }, () => ({ assetId })),
    });

    expect(result.success).toBe(false);
  });
});
