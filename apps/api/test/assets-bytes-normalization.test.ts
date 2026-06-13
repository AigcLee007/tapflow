import { describe, expect, test } from "vitest";

import {
  __assetsServiceTestUtils,
} from "../src/modules/assets/assets.service.js";

describe("asset bytes normalization", () => {
  test("uses actual body length when storage reports stale zero content length", () => {
    const result = __assetsServiceTestUtils.normalizeAssetObjectForBytesResponse(
      {
        body: Buffer.from("preview-webp-bytes"),
        contentLength: 0,
        contentType: "image/webp",
      },
      {
        contentType: "image/webp",
        variantKey: "preview",
      },
    );

    expect(result.contentLength).toBe(Buffer.byteLength("preview-webp-bytes"));
    expect(result.variantKey).toBe("preview");
    expect(result.body.toString("utf8")).toBe("preview-webp-bytes");
  });

  test("marks requested variant bytes as unusable when the object body is empty", () => {
    expect(
      __assetsServiceTestUtils.shouldFallbackEmptyVariantBytes({
        body: Buffer.alloc(0),
        variantKey: "preview",
      }),
    ).toBe(true);
    expect(
      __assetsServiceTestUtils.shouldFallbackEmptyVariantBytes({
        body: Buffer.from("original"),
        variantKey: null,
      }),
    ).toBe(false);
  });
});
