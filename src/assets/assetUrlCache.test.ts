import { beforeEach, describe, expect, test } from "vitest";

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
      requestedVariantKey: "thumb",
      servedVariantKey: "thumb",
      status: "ok",
      url: "https://example.test/thumb.webp",
    });

    expect(getCachedAssetUrl("asset-1", "thumb")).toMatchObject({
      requestedVariantKey: "thumb",
      servedVariantKey: "thumb",
      url: "https://example.test/thumb.webp",
    });
  });

  test("does not return urls that are close to expiring", () => {
    setCachedAssetUrl({
      assetId: "asset-2",
      expiresAt: new Date(Date.now() + 20_000).toISOString(),
      requestedVariantKey: "preview",
      servedVariantKey: "preview",
      status: "ok",
      url: "https://example.test/old.webp",
    });

    expect(getCachedAssetUrl("asset-2", "preview")).toBeNull();
  });

  test("restores an unexpired url from session storage within the same auth scope", () => {
    setCachedAssetUrl({
      assetId: "asset-session",
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      requestedVariantKey: "thumb",
      servedVariantKey: "preview",
      status: "fallback",
      url: "https://example.test/session-thumb.webp",
    });
    clearAssetUrlMemoryCache();
    setAssetUrlCacheScope(null);
    setAssetUrlCacheScope({ tenantId: "tenant-a", userId: "user-a" });

    expect(getCachedAssetUrl("asset-session", "thumb")).toMatchObject({
      requestedVariantKey: "thumb",
      servedVariantKey: "preview",
      status: "fallback",
    });
  });

  test("does not reuse cached urls after switching tenant or user", () => {
    setCachedAssetUrl({
      assetId: "asset-isolated",
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      requestedVariantKey: "thumb",
      servedVariantKey: "thumb",
      status: "ok",
      url: "https://example.test/isolated.webp",
    });
    setAssetUrlCacheScope({ tenantId: "tenant-b", userId: "user-b" });

    expect(getCachedAssetUrl("asset-isolated", "thumb")).toBeNull();
  });

  test("discards malformed persisted session data", () => {
    const key = "tapflow.asset-url-cache.v1:tenant-a:user-a";
    sessionStorage.setItem(key, "not json");
    setAssetUrlCacheScope(null);
    setAssetUrlCacheScope({ tenantId: "tenant-a", userId: "user-a" });

    expect(sessionStorage.getItem(key)).toBeNull();
  });

  test("does not hydrate invalid persisted entries", () => {
    const key = "tapflow.asset-url-cache.v1:tenant-a:user-a";
    sessionStorage.setItem(key, JSON.stringify([{
      assetId: "asset-invalid",
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      requestedVariantKey: "thumb",
      servedVariantKey: "thumb",
      status: "ok",
      url: "javascript:alert(1)",
    }]));
    setAssetUrlCacheScope(null);
    setAssetUrlCacheScope({ tenantId: "tenant-a", userId: "user-a" });

    expect(getCachedAssetUrl("asset-invalid", "thumb")).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(key) || "[]")).toEqual([]);
  });

  test("keeps the two hundred latest-expiring entries", () => {
    const expiry = new Date(Date.now() + 10 * 60_000);
    for (let index = 0; index < 201; index += 1) {
      setCachedAssetUrl({
        assetId: `asset-${index}`,
        expiresAt: new Date(expiry.getTime() + index * 1_000).toISOString(),
        requestedVariantKey: "thumb",
        servedVariantKey: "thumb",
        status: "ok",
        url: `https://example.test/${index}.webp`,
      });
    }

    expect(getCachedAssetUrl("asset-0", "thumb")).toBeNull();
    expect(getCachedAssetUrl("asset-200", "thumb")).toMatchObject({ assetId: "asset-200" });
    const key = "tapflow.asset-url-cache.v1:tenant-a:user-a";
    expect(JSON.parse(sessionStorage.getItem(key) || "[]")).toHaveLength(200);
  });
});
