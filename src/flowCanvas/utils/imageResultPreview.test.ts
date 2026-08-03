import { describe, expect, test } from "vitest";

import { getImageResultAssetId, selectImageResultPreviewUrl } from "./imageResultPreview";

describe("imageResultPreview", () => {
  test("derives an asset id from generated result metadata or its asset-id key", () => {
    expect(getImageResultAssetId({ assetId: "asset-explicit", id: "result-1" }, 0, [])).toBe("asset-explicit");
    expect(getImageResultAssetId({ id: "asset:asset-from-id" }, 0, [])).toBe("asset-from-id");
    expect(getImageResultAssetId({ id: "result-3" }, 2, ["asset-1", "asset-2", "asset-indexed"])).toBe("asset-indexed");
  });

  test("prefers a freshly resolved URL over a stale persisted result URL", () => {
    expect(selectImageResultPreviewUrl({
      assetId: "asset-expired",
      persistedUrl: "https://cdn.test/expired.png?X-Amz-Signature=stale",
      resolvedUrl: "https://cdn.test/fresh.png?X-Amz-Signature=fresh",
      fallbackUrl: "https://cdn.test/fallback.png",
    })).toBe("https://cdn.test/fresh.png?X-Amz-Signature=fresh");
  });

  test("falls back to persisted and then primary URLs while resolution is pending", () => {
    expect(selectImageResultPreviewUrl({
      assetId: "asset-pending",
      persistedUrl: "https://cdn.test/persisted.png",
      fallbackUrl: "https://cdn.test/primary.png",
    })).toBe("https://cdn.test/persisted.png");
    expect(selectImageResultPreviewUrl({
      fallbackUrl: "https://cdn.test/primary.png",
    })).toBe("https://cdn.test/primary.png");
  });
});
