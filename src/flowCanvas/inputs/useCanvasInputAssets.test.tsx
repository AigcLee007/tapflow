import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AssetItem } from "../../assets/assetApi";
import type { CanvasInputItem } from "./canvasInputProjection";
import { useCanvasInputAssets } from "./useCanvasInputAssets";

const { getAsset, getAssetVariantUrl } = vi.hoisted(() => ({
  getAsset: vi.fn(),
  getAssetVariantUrl: vi.fn(),
}));

vi.mock("../../assets/assetApi", () => ({
  getAsset,
  getAssetVariantUrl,
}));

const imageInput: CanvasInputItem = {
  assetId: "asset-image",
  inputKey: "asset:asset-image",
  kind: "image",
  order: 0,
  previewState: "loading",
  source: "asset",
  title: "",
};

const audioInput: CanvasInputItem = {
  assetId: "asset-audio",
  inputKey: "asset:asset-audio",
  kind: "audio",
  order: 1,
  previewState: "loading",
  source: "asset",
  title: "Audio input",
};

function makeAsset(overrides: Partial<AssetItem> = {}): AssetItem {
  return {
    bucket: "assets",
    checksumSha256: null,
    createdAt: "2026-08-07T00:00:00.000Z",
    deletedAt: null,
    description: null,
    durationMs: null,
    favorite: false,
    height: null,
    id: "asset-image",
    kind: "image",
    metadata: {},
    mimeType: "image/png",
    objectKey: "image.png",
    originalFilename: "source.png",
    ownerUserId: null,
    projectId: null,
    sizeBytes: null,
    source: "upload",
    status: "ready",
    storageProvider: "s3",
    tags: [],
    tenantId: "tenant-1",
    title: "Resolved title",
    updatedAt: "2026-08-07T00:00:00.000Z",
    variants: [],
    width: null,
    ...overrides,
  };
}

describe("useCanvasInputAssets", () => {
  beforeEach(() => {
    getAsset.mockReset();
    getAssetVariantUrl.mockReset();
  });

  it("deduplicates asset resolution, fills missing display metadata, and only requests visual thumbnails", async () => {
    getAsset.mockImplementation((assetId: string) => Promise.resolve(makeAsset({
      id: assetId,
      kind: assetId === "asset-audio" ? "audio" : "image",
      durationMs: assetId === "asset-audio" ? 1234 : null,
    })));
    getAssetVariantUrl.mockResolvedValue({ expiresAt: "2026-08-08T00:00:00.000Z", method: "GET", url: "https://cdn.test/thumb.png" });

    const { result } = renderHook(() => useCanvasInputAssets([
      imageInput,
      { ...imageInput, inputKey: "upstream:image", order: 2 },
      audioInput,
      { inputKey: "upstream:text", kind: "text", order: 3, previewState: "ready", source: "upstream", textExcerpt: "kept", title: "Text input" },
    ]));

    await waitFor(() => expect(result.current.items[0].previewState).toBe("ready"));

    expect(getAsset).toHaveBeenCalledTimes(2);
    expect(getAssetVariantUrl).toHaveBeenCalledTimes(1);
    expect(getAssetVariantUrl).toHaveBeenCalledWith("asset-image", "thumb");
    expect(result.current.items[0]).toMatchObject({ previewUrl: "https://cdn.test/thumb.png", title: "Resolved title" });
    expect(result.current.items[1].previewUrl).toBe("https://cdn.test/thumb.png");
    expect(result.current.items[2]).toMatchObject({ durationMs: 1234, previewState: "ready", title: "Audio input" });
    expect(result.current.items[3]).toMatchObject({ textExcerpt: "kept", previewState: "ready" });
  });

  it("retains failed cards without exposing the error and retries only the requested asset", async () => {
    let imageAttempts = 0;
    getAsset.mockImplementation((assetId: string) => {
      if (assetId === "asset-image" && imageAttempts++ === 0) {
        return Promise.reject(new Error("Bearer secret-token must not render"));
      }
      return Promise.resolve(makeAsset({ id: assetId }));
    });
    getAssetVariantUrl.mockResolvedValue({ expiresAt: "2026-08-08T00:00:00.000Z", method: "GET", url: "https://cdn.test/retry.png" });

    const { result } = renderHook(() => useCanvasInputAssets([imageInput, audioInput]));

    await waitFor(() => expect(result.current.items[0].previewState).toBe("error"));
    expect(result.current.items[0]).not.toHaveProperty("error");
    expect(JSON.stringify(result.current)).not.toContain("secret-token");

    await act(async () => result.current.retry("asset-image"));

    await waitFor(() => expect(result.current.items[0]).toMatchObject({ previewState: "ready", previewUrl: "https://cdn.test/retry.png" }));
    expect(getAsset).toHaveBeenCalledWith("asset-image");
    expect(getAsset).toHaveBeenCalledTimes(3);
  });

  it("keeps resolved asset cache when item order changes", async () => {
    getAsset.mockImplementation((assetId: string) => Promise.resolve(makeAsset({ id: assetId })));
    getAssetVariantUrl.mockImplementation((assetId: string) => Promise.resolve({ expiresAt: "2026-08-08T00:00:00.000Z", method: "GET", url: `https://cdn.test/${assetId}.png` }));

    const { rerender, result } = renderHook(({ items }) => useCanvasInputAssets(items), {
      initialProps: { items: [imageInput, audioInput] },
    });
    await waitFor(() => expect(result.current.items[0].previewState).toBe("ready"));

    rerender({ items: [{ ...audioInput, order: 0 }, { ...imageInput, order: 1 }] });

    expect(getAsset).toHaveBeenCalledTimes(2);
    expect(getAssetVariantUrl).toHaveBeenCalledTimes(1);
    expect(result.current.items[1]).toMatchObject({ previewState: "ready", previewUrl: "https://cdn.test/asset-image.png" });
  });

  it("does not update hook state after unmount while an asset request is pending", async () => {
    let resolveAsset: ((asset: AssetItem) => void) | undefined;
    getAsset.mockImplementation(() => new Promise<AssetItem>((resolve) => { resolveAsset = resolve; }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useCanvasInputAssets([imageInput]));

    unmount();
    await act(async () => resolveAsset?.(makeAsset()));

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("ignores stale asset responses after the input set changes", async () => {
    let resolveFirst: ((asset: AssetItem) => void) | undefined;
    getAsset.mockImplementation((assetId: string) => {
      if (assetId === "asset-image") {
        return new Promise<AssetItem>((resolve) => { resolveFirst = resolve; });
      }
      return Promise.resolve(makeAsset({ id: assetId, title: "Fresh asset" }));
    });

    const { rerender, result } = renderHook(({ items }) => useCanvasInputAssets(items), {
      initialProps: { items: [imageInput] },
    });
    rerender({ items: [audioInput] });
    await waitFor(() => expect(result.current.items[0]).toMatchObject({ title: "Audio input", previewState: "ready" }));

    await act(async () => resolveFirst?.(makeAsset({ id: "asset-image", title: "Stale image" })));

    expect(result.current.items[0]).toMatchObject({ assetId: "asset-audio", title: "Audio input", previewState: "ready" });
  });
});
