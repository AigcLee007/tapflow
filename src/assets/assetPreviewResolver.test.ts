import { beforeEach, describe, expect, test, vi } from "vitest";

const getAssetSignedUrlsMock = vi.hoisted(() => vi.fn());

vi.mock("./assetApi", () => ({
  getAssetSignedUrls: (...args: unknown[]) => getAssetSignedUrlsMock(...args),
}));

import {
  clearAssetPreviewResolver,
  invalidateAssetPreviewUrl,
  resolveAssetPreviewUrl,
} from "./assetPreviewResolver";
import { clearAssetUrlCache, setCachedAssetUrl } from "./assetUrlCache";

function signedItem(assetId: string, variantKey: string | null = "preview") {
  return {
    assetId,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    method: "GET" as const,
    url: `https://cdn.test/${assetId}-${variantKey || "original"}.png`,
    variantKey,
  };
}

describe("assetPreviewResolver", () => {
  beforeEach(() => {
    clearAssetPreviewResolver();
    clearAssetUrlCache();
    getAssetSignedUrlsMock.mockReset();
  });

  test("returns an unexpired cached preview without signing again", async () => {
    setCachedAssetUrl({
      assetId: "asset-cached",
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      url: "https://cdn.test/cached.png",
      variantKey: "preview",
    });

    await expect(resolveAssetPreviewUrl("asset-cached")).resolves.toBe("https://cdn.test/cached.png");
    expect(getAssetSignedUrlsMock).not.toHaveBeenCalled();
  });

  test("coalesces same-asset requests into one signed-url request", async () => {
    getAssetSignedUrlsMock.mockResolvedValue({ items: [signedItem("asset-one")] });

    const [first, second] = await Promise.all([
      resolveAssetPreviewUrl("asset-one"),
      resolveAssetPreviewUrl("asset-one"),
    ]);

    expect(first).toBe(second);
    expect(getAssetSignedUrlsMock).toHaveBeenCalledTimes(1);
    expect(getAssetSignedUrlsMock).toHaveBeenCalledWith([{ assetId: "asset-one", variantKey: "preview" }]);
  });

  test("splits large request bursts into batches of one hundred", async () => {
    getAssetSignedUrlsMock.mockImplementation(async (requests: Array<{ assetId: string; variantKey?: string }>) => ({
      items: requests.map((request) => signedItem(request.assetId)),
    }));

    const ids = Array.from({ length: 101 }, (_, index) => `asset-${index}`);
    const urls = await Promise.all(ids.map((assetId) => resolveAssetPreviewUrl(assetId)));

    expect(urls).toHaveLength(101);
    expect(getAssetSignedUrlsMock).toHaveBeenCalledTimes(2);
    expect(getAssetSignedUrlsMock.mock.calls.map(([requests]) => requests.length)).toEqual([100, 1]);
  });

  test("falls back to original signed URLs when the preview batch fails", async () => {
    getAssetSignedUrlsMock
      .mockRejectedValueOnce(new Error("preview variant missing"))
      .mockResolvedValueOnce({ items: [signedItem("asset-fallback", null)] });

    await expect(resolveAssetPreviewUrl("asset-fallback")).resolves.toBe("https://cdn.test/asset-fallback-original.png");
    expect(getAssetSignedUrlsMock).toHaveBeenNthCalledWith(1, [{ assetId: "asset-fallback", variantKey: "preview" }]);
    expect(getAssetSignedUrlsMock).toHaveBeenNthCalledWith(2, [{ assetId: "asset-fallback" }]);
  });

  test("invalidates an expired URL before resolving a fresh one", async () => {
    setCachedAssetUrl({
      assetId: "asset-refresh",
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      url: "https://cdn.test/stale.png",
      variantKey: "preview",
    });
    getAssetSignedUrlsMock.mockResolvedValue({ items: [signedItem("asset-refresh")] });

    invalidateAssetPreviewUrl("asset-refresh");

    await expect(resolveAssetPreviewUrl("asset-refresh")).resolves.toBe("https://cdn.test/asset-refresh-preview.png");
    expect(getAssetSignedUrlsMock).toHaveBeenCalledTimes(1);
  });
});
