import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const refreshAssetUrlMock = vi.hoisted(() => vi.fn());
const resolveAssetUrlMock = vi.hoisted(() => vi.fn());

vi.mock("../../assets/assetPreviewResolver", () => ({
  refreshAssetUrl: (...args: unknown[]) => refreshAssetUrlMock(...args),
  resolveAssetUrl: (...args: unknown[]) => resolveAssetUrlMock(...args),
}));

import { useLayeredImageAssetUrls } from "./useLayeredImageAssetUrls";

function result(assetId: string, variantKey: "thumb" | "preview") {
  return {
    assetId,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    requestedVariantKey: variantKey,
    servedVariantKey: variantKey,
    status: "ok" as const,
    url: `https://storage.test/${assetId}-${variantKey}.webp`,
  };
}

describe("useLayeredImageAssetUrls", () => {
  beforeEach(() => {
    refreshAssetUrlMock.mockReset();
    resolveAssetUrlMock.mockReset();
  });

  test("loads thumbnails before a fullscreen preview is requested", async () => {
    resolveAssetUrlMock.mockImplementation((assetId: string, variantKey: "thumb" | "preview") => Promise.resolve(result(assetId, variantKey)));
    const { result: hook, rerender } = renderHook(
      ({ loadPreview }) => useLayeredImageAssetUrls({ assetIds: ["asset-a", "asset-b"], loadPreview, previewAssetId: "asset-a" }),
      { initialProps: { loadPreview: false } },
    );

    await waitFor(() => expect(hook.current.thumbnailUrlsByAssetId).toEqual({
      "asset-a": "https://storage.test/asset-a-thumb.webp",
      "asset-b": "https://storage.test/asset-b-thumb.webp",
    }));
    expect(resolveAssetUrlMock).toHaveBeenCalledWith("asset-a", "thumb");
    expect(resolveAssetUrlMock).not.toHaveBeenCalledWith("asset-a", "preview");

    rerender({ loadPreview: true });

    await waitFor(() => expect(hook.current.previewUrl).toBe("https://storage.test/asset-a-preview.webp"));
    expect(resolveAssetUrlMock).toHaveBeenCalledWith("asset-a", "preview");
  });

  test("keeps successful thumbnails when another asset fails and refreshes the exact thumb", async () => {
    resolveAssetUrlMock
      .mockResolvedValueOnce(result("asset-good", "thumb"))
      .mockRejectedValueOnce(new Error("unavailable"));
    refreshAssetUrlMock.mockResolvedValue(result("asset-good", "thumb"));
    const { result: hook } = renderHook(() => useLayeredImageAssetUrls({ assetIds: ["asset-good", "asset-bad"] }));

    await waitFor(() => expect(hook.current.thumbnailUrlsByAssetId).toEqual({
      "asset-good": "https://storage.test/asset-good-thumb.webp",
    }));
    await act(async () => {
      await hook.current.refreshThumbnail("asset-good");
    });

    expect(refreshAssetUrlMock).toHaveBeenCalledWith("asset-good", "thumb");
  });
});
