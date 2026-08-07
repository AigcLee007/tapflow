import { StrictMode } from "react";
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

const videoInput: CanvasInputItem = {
  assetId: "asset-video",
  inputKey: "asset:asset-video",
  kind: "video",
  order: 0,
  previewState: "loading",
  source: "asset",
  title: "",
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

  it("deduplicates asset resolution, fills missing display metadata, and requests both visual variants", async () => {
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
    expect(getAssetVariantUrl).toHaveBeenCalledTimes(2);
    expect(getAssetVariantUrl).toHaveBeenCalledWith("asset-image", "thumb");
    expect(getAssetVariantUrl).toHaveBeenCalledWith("asset-image", "preview");
    expect(result.current.items[0]).toMatchObject({ previewUrl: "https://cdn.test/thumb.png", title: "Resolved title" });
    expect(result.current.items[1].previewUrl).toBe("https://cdn.test/thumb.png");
    expect(result.current.items[2]).toMatchObject({ durationMs: 1234, previewState: "ready", title: "Audio input" });
    expect(result.current.items[3]).toMatchObject({ textExcerpt: "kept", previewState: "ready" });
  });

  it("resolves a video thumbnail separately from its playable hover preview", async () => {
    getAsset.mockResolvedValue(makeAsset({
      id: "asset-video",
      kind: "video",
      title: "Clip",
    }));
    getAssetVariantUrl.mockImplementation(async (_assetId: string, variant: string) => ({
      expiresAt: "2026-08-08T00:00:00.000Z",
      method: "GET",
      url: variant === "thumb" ? "https://cdn.test/clip.webp" : "https://cdn.test/clip.mp4",
    }));

    const { result } = renderHook(() => useCanvasInputAssets([videoInput]));

    await waitFor(() => expect(result.current.items[0]).toMatchObject({
      hoverPreviewUrl: "https://cdn.test/clip.mp4",
      previewState: "ready",
      thumbnailUrl: "https://cdn.test/clip.webp",
    }));
    expect(getAssetVariantUrl).toHaveBeenCalledWith("asset-video", "thumb");
    expect(getAssetVariantUrl).toHaveBeenCalledWith("asset-video", "preview");
  });

  it("uses a legacy video preview URL only as a hover fallback", async () => {
    getAsset.mockResolvedValue(makeAsset({
      id: "asset-video",
      kind: "video",
      previewUrl: "https://cdn.test/legacy-video.mp4",
    }));
    getAssetVariantUrl.mockRejectedValue(new Error("variant unavailable"));

    const { result } = renderHook(() => useCanvasInputAssets([videoInput]));

    await waitFor(() => expect(result.current.items[0]).toMatchObject({
      hoverPreviewUrl: "https://cdn.test/legacy-video.mp4",
      previewState: "ready",
    }));
    expect(result.current.items[0].thumbnailUrl).toBeUndefined();
  });

  it("keeps a preview ready when metadata fails but one media variant resolves", async () => {
    getAsset.mockRejectedValue(new Error("metadata unavailable"));
    getAssetVariantUrl.mockImplementation(async (_assetId: string, variant: string) => {
      if (variant === "thumb") throw new Error("thumb unavailable");
      return { expiresAt: "2026-08-08T00:00:00.000Z", method: "GET", url: "https://cdn.test/metadata-independent-preview.mp4" };
    });

    const { result } = renderHook(() => useCanvasInputAssets([videoInput]));

    await waitFor(() => expect(result.current.items[0]).toMatchObject({
      hoverPreviewUrl: "https://cdn.test/metadata-independent-preview.mp4",
      previewState: "ready",
    }));
    expect(getAssetVariantUrl).toHaveBeenCalledWith("asset-video", "thumb");
    expect(getAssetVariantUrl).toHaveBeenCalledWith("asset-video", "preview");
  });

  it("keeps a ready thumbnail when the hover variant is unavailable", async () => {
    getAsset.mockResolvedValue(makeAsset());
    getAssetVariantUrl.mockImplementation(async (_assetId: string, variant: string) => {
      if (variant === "preview") throw new Error("preview pending");
      return {
        expiresAt: "2026-08-08T00:00:00.000Z",
        method: "GET",
        url: "https://cdn.test/image-thumb.webp",
      };
    });

    const { result } = renderHook(() => useCanvasInputAssets([imageInput]));

    await waitFor(() => expect(result.current.items[0]).toMatchObject({
      previewState: "ready",
      thumbnailUrl: "https://cdn.test/image-thumb.webp",
    }));
    expect(result.current.items[0].hoverPreviewUrl).toBeUndefined();
  });

  it("retains failed cards without exposing the error and retries only the requested asset", async () => {
    let imageAttempts = 0;
    getAsset.mockImplementation((assetId: string) => {
      if (assetId === "asset-image" && imageAttempts++ === 0) {
        return Promise.reject(new Error("Bearer secret-token must not render"));
      }
      return Promise.resolve(makeAsset({ id: assetId }));
    });
    getAssetVariantUrl.mockImplementation((assetId: string) => {
      if (assetId === "asset-image" && imageAttempts === 1) {
        return Promise.reject(new Error("variant unavailable"));
      }
      return Promise.resolve({ expiresAt: "2026-08-08T00:00:00.000Z", method: "GET", url: "https://cdn.test/retry.png" });
    });

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
    expect(getAssetVariantUrl).toHaveBeenCalledTimes(2);
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

  it("keeps another pending asset active when retrying a different asset", async () => {
    const resolvers = new Map<string, Array<(asset: AssetItem) => void>>();
    getAsset.mockImplementation((assetId: string) => new Promise<AssetItem>((resolve) => {
      const pending = resolvers.get(assetId) ?? [];
      pending.push(resolve);
      resolvers.set(assetId, pending);
    }));
    getAssetVariantUrl.mockImplementation((assetId: string) => Promise.resolve({ expiresAt: "2026-08-08T00:00:00.000Z", method: "GET", url: `https://cdn.test/${assetId}.png` }));
    const assetA = { ...imageInput, assetId: "asset-a", inputKey: "asset:asset-a" };
    const assetB = { ...imageInput, assetId: "asset-b", inputKey: "asset:asset-b", order: 1 };
    const { result } = renderHook(() => useCanvasInputAssets([assetA, assetB]));

    await waitFor(() => expect(resolvers.get("asset-a")?.length).toBe(1));
    await act(async () => result.current.retry("asset-a"));
    await waitFor(() => expect(resolvers.get("asset-a")?.length).toBe(2));
    await act(async () => resolvers.get("asset-b")?.[0](makeAsset({ id: "asset-b", title: "B" })));

    await waitFor(() => expect(result.current.items[1]).toMatchObject({ previewState: "ready", title: "B" }));
    await act(async () => resolvers.get("asset-a")?.[0](makeAsset({ id: "asset-a", title: "Old A" })));
    await act(async () => resolvers.get("asset-a")?.[1](makeAsset({ id: "asset-a", title: "New A" })));
    await waitFor(() => expect(result.current.items[0]).toMatchObject({ previewState: "ready", title: "New A" }));
  });

  it("resolves the current asset after React StrictMode runs effect cleanup and setup", async () => {
    getAsset.mockResolvedValue(makeAsset({ title: "Strict ready" }));
    getAssetVariantUrl.mockResolvedValue({ expiresAt: "2026-08-08T00:00:00.000Z", method: "GET", url: "https://cdn.test/strict.png" });

    const { result } = renderHook(() => useCanvasInputAssets([imageInput]), {
      wrapper: StrictMode,
    });

    await waitFor(() => expect(result.current.items[0]).toMatchObject({ previewState: "ready", previewUrl: "https://cdn.test/strict.png", title: "Strict ready" }));
    expect(getAsset).toHaveBeenCalled();
  });
});
