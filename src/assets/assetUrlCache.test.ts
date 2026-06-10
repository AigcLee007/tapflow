import { describe, expect, test } from "vitest";

import { getCachedAssetUrl, setCachedAssetUrl } from "./assetUrlCache";

describe("assetUrlCache", () => {
  test("returns cached urls before expiry", () => {
    setCachedAssetUrl({
      assetId: "asset-1",
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      url: "https://example.test/thumb.webp",
      variantKey: "thumb",
    });

    expect(getCachedAssetUrl("asset-1", "thumb")).toBe("https://example.test/thumb.webp");
  });

  test("does not return urls that are close to expiring", () => {
    setCachedAssetUrl({
      assetId: "asset-2",
      expiresAt: new Date(Date.now() + 20_000).toISOString(),
      url: "https://example.test/old.webp",
      variantKey: "preview",
    });

    expect(getCachedAssetUrl("asset-2", "preview")).toBeNull();
  });
});
