import { beforeEach, describe, expect, it, vi } from "vitest";

const getAssetDownloadUrlMock = vi.fn();
const downloadImageMock = vi.fn();

vi.mock("../../assets/assetApi", () => ({
  getAssetDownloadUrl: (...args: unknown[]) => getAssetDownloadUrlMock(...args),
}));

vi.mock("./imageUtils", () => ({
  downloadImage: (...args: unknown[]) => downloadImageMock(...args),
}));

describe("imageDownload", () => {
  beforeEach(() => {
    getAssetDownloadUrlMock.mockReset();
    downloadImageMock.mockReset();
  });

  it("resolves asset result ids from generated result metadata", async () => {
    const { getAssetIdFromResultId, getPreferredImageDownloadAssetId } = await import("./imageDownload");

    expect(getAssetIdFromResultId("asset:asset-123")).toBe("asset-123");
    expect(getAssetIdFromResultId("runtime-asset-asset-123-0")).toBe("");
    expect(getPreferredImageDownloadAssetId({
      nodeAssetId: "node-cover-asset",
      resultId: "asset:selected-result-asset",
    })).toBe("selected-result-asset");
  });

  it("downloads the original asset url instead of the preview fallback", async () => {
    getAssetDownloadUrlMock.mockResolvedValue({
      expiresAt: "2026-06-12T00:00:00.000Z",
      method: "GET",
      url: "https://cdn.test/originals/pig.png?signature=abc",
    });

    const { downloadOriginalImage } = await import("./imageDownload");

    await downloadOriginalImage({
      assetId: "asset-pig",
      fallbackUrl: "https://cdn.test/previews/pig-preview.webp",
      filenameBase: "image-node-1",
      mimeType: "image/png",
    });

    expect(getAssetDownloadUrlMock).toHaveBeenCalledWith("asset-pig");
    expect(downloadImageMock).toHaveBeenCalledWith(
      "https://cdn.test/originals/pig.png?signature=abc",
      "image-node-1.png",
    );
  });

  it("falls back to the visible url when an original asset url is unavailable", async () => {
    getAssetDownloadUrlMock.mockRejectedValue(new Error("download url failed"));

    const { downloadOriginalImage } = await import("./imageDownload");

    await downloadOriginalImage({
      assetId: "asset-pig",
      fallbackUrl: "https://cdn.test/previews/pig-preview.webp",
      filenameBase: "image-node-1",
      mimeType: "image/png",
    });

    expect(downloadImageMock).toHaveBeenCalledWith(
      "https://cdn.test/previews/pig-preview.webp",
      "image-node-1.webp",
    );
  });
});
