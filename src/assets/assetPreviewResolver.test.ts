import { beforeEach, describe, expect, test, vi } from "vitest";

const getAssetSignedUrlsMock = vi.hoisted(() => vi.fn());

vi.mock("./assetApi", () => ({
  getAssetSignedUrls: (...args: unknown[]) => getAssetSignedUrlsMock(...args),
}));

import {
  clearAssetPreviewResolver,
  invalidateAssetUrl,
  invalidateAssetPreviewUrl,
  refreshAssetUrl,
  resolveAssetUrl,
  resolveAssetPreviewUrl,
} from "./assetPreviewResolver";
import { clearAssetUrlCache, setCachedAssetUrl } from "./assetUrlCache";

function signedItem(assetId: string, variantKey: string | null = "preview") {
  return {
    assetId,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    method: "GET" as const,
    requestedVariantKey: "preview" as const,
    servedVariantKey: variantKey as "thumb" | "preview" | null,
    status: variantKey === "preview" ? "ok" as const : "fallback" as const,
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
      requestedVariantKey: "preview",
      servedVariantKey: "preview",
      status: "ok",
      url: "https://cdn.test/cached.png",
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
    expect(getAssetSignedUrlsMock).toHaveBeenCalledWith([
      { allowVariantFallback: true, assetId: "asset-one", variantKey: "preview" },
    ]);
  });

  test("requests a thumb with per-item fallback instead of retrying the batch as originals", async () => {
    getAssetSignedUrlsMock.mockResolvedValue({
      errors: [],
      items: [{
        ...signedItem("asset-thumb", "preview"),
        requestedVariantKey: "thumb",
        servedVariantKey: "preview",
        status: "fallback",
      }],
    });

    await expect(resolveAssetPreviewUrl("asset-thumb", "thumb")).resolves.toBe("https://cdn.test/asset-thumb-preview.png");
    expect(getAssetSignedUrlsMock).toHaveBeenCalledWith([
      { allowVariantFallback: true, assetId: "asset-thumb", variantKey: "thumb" },
    ]);
  });

  test("preserves the requested and served variants in the canonical result", async () => {
    getAssetSignedUrlsMock.mockResolvedValue({
      errors: [],
      items: [{
        ...signedItem("asset-thumb", "preview"),
        requestedVariantKey: "thumb",
        servedVariantKey: "preview",
        status: "fallback",
      }],
    });

    await expect(resolveAssetUrl("asset-thumb", "thumb")).resolves.toMatchObject({
      assetId: "asset-thumb",
      requestedVariantKey: "thumb",
      servedVariantKey: "preview",
      status: "fallback",
      url: "https://cdn.test/asset-thumb-preview.png",
    });
  });

  test("retries a transient signing failure once after 150ms", async () => {
    vi.useFakeTimers();
    getAssetSignedUrlsMock
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce({ errors: [], items: [signedItem("asset-retry")] });

    const result = resolveAssetUrl("asset-retry", "preview");
    await vi.advanceTimersByTimeAsync(150);

    await expect(result).resolves.toMatchObject({ assetId: "asset-retry" });
    expect(getAssetSignedUrlsMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  test("rejects only the unavailable asset in a mixed signing response", async () => {
    getAssetSignedUrlsMock.mockResolvedValue({
      errors: [{ assetId: "asset-missing", code: "ASSET_UNAVAILABLE" }],
      items: [signedItem("asset-present")],
    });

    const [present, missing] = await Promise.allSettled([
      resolveAssetUrl("asset-present", "preview"),
      resolveAssetUrl("asset-missing", "thumb"),
    ]);

    expect(present).toMatchObject({ status: "fulfilled" });
    expect(missing).toMatchObject({ status: "rejected" });
    expect(getAssetSignedUrlsMock).toHaveBeenCalledTimes(1);
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

  test("uses an original fallback returned by the same request", async () => {
    getAssetSignedUrlsMock.mockResolvedValue({
      errors: [],
      items: [{
        ...signedItem("asset-fallback", null),
        requestedVariantKey: "preview",
        servedVariantKey: null,
        status: "fallback",
      }],
    });

    await expect(resolveAssetPreviewUrl("asset-fallback")).resolves.toBe("https://cdn.test/asset-fallback-original.png");
    expect(getAssetSignedUrlsMock).toHaveBeenCalledTimes(1);
  });

  test("invalidates an expired URL before resolving a fresh one", async () => {
    setCachedAssetUrl({
      assetId: "asset-refresh",
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      requestedVariantKey: "preview",
      servedVariantKey: "preview",
      status: "ok",
      url: "https://cdn.test/stale.png",
    });
    getAssetSignedUrlsMock.mockResolvedValue({ items: [signedItem("asset-refresh")] });

    invalidateAssetPreviewUrl("asset-refresh");

    await expect(resolveAssetPreviewUrl("asset-refresh")).resolves.toBe("https://cdn.test/asset-refresh-preview.png");
    expect(getAssetSignedUrlsMock).toHaveBeenCalledTimes(1);
  });

  test("refreshes exactly the failed thumbnail entry", async () => {
    getAssetSignedUrlsMock.mockResolvedValue({
      errors: [],
      items: [{
        ...signedItem("asset-refresh-thumb", "thumb"),
        requestedVariantKey: "thumb",
        servedVariantKey: "thumb",
      }],
    });

    invalidateAssetUrl("asset-refresh-thumb", "thumb");
    await expect(refreshAssetUrl("asset-refresh-thumb", "thumb")).resolves.toMatchObject({
      requestedVariantKey: "thumb",
      servedVariantKey: "thumb",
    });
    expect(getAssetSignedUrlsMock).toHaveBeenCalledWith([
      { allowVariantFallback: true, assetId: "asset-refresh-thumb", variantKey: "thumb" },
    ]);
  });
});
