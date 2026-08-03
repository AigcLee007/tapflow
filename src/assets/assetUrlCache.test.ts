import { describe, expect, test } from "vitest";

import {
  clearAssetUrlCache,
  clearAssetUrlMemoryCache,
  getCachedAssetUrl,
  setAssetUrlCacheScope,
  setCachedAssetUrl,
} from "./assetUrlCache";

describe("assetUrlCache", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAssetUrlCache();
    setAssetUrlCacheScope({ tenantId: "tenant-a", userId: "user-a" });
  });
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

  test("restores an unexpired url from session storage within the same auth scope", () => {
    setCachedAssetUrl({
      assetId: "asset-session",
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      url: "https://example.test/session-thumb.webp",
      variantKey: "thumb",
    });
    clearAssetUrlMemoryCache();
    setAssetUrlCacheScope(null);
    setAssetUrlCacheScope({ tenantId: "tenant-a", userId: "user-a" });

    expect(getCachedAssetUrl("asset-session", "thumb")).toBe("https://example.test/session-thumb.webp");
  });

  test("does not reuse cached urls after switching tenant or user", () => {
    setCachedAssetUrl({
      assetId: "asset-isolated",
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      url: "https://example.test/isolated.webp",
      variantKey: "thumb",
    });
    setAssetUrlCacheScope({ tenantId: "tenant-b", userId: "user-b" });

    expect(getCachedAssetUrl("asset-isolated", "thumb")).toBeNull();
  });
});
