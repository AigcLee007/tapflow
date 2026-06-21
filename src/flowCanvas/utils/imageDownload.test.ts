import { beforeEach, describe, expect, it, vi } from "vitest";

const downloadImageMock = vi.fn();
const triggerBrowserDownloadMock = vi.fn();
const getAssetDownloadUrlMock = vi.fn();

vi.mock("./imageUtils", () => ({
  downloadImage: (...args: unknown[]) => downloadImageMock(...args),
  triggerBrowserDownload: (...args: unknown[]) => triggerBrowserDownloadMock(...args),
}));

vi.mock("../../assets/assetApi", () => ({
  getAssetDownloadUrl: (...args: unknown[]) => getAssetDownloadUrlMock(...args),
}));

describe("imageDownload", () => {
  beforeEach(() => {
    downloadImageMock.mockReset();
    triggerBrowserDownloadMock.mockReset();
    getAssetDownloadUrlMock.mockReset();
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("resolves asset result ids from generated result metadata", async () => {
    const {
      getAssetIdFromAssetUrl,
      getAssetIdFromResultId,
      getPreferredImageDownloadAssetId,
    } = await import("./imageDownload");

    expect(getAssetIdFromResultId("asset:asset-123")).toBe("asset-123");
    expect(getAssetIdFromResultId("runtime-asset-asset-123-0")).toBe("");
    expect(getAssetIdFromAssetUrl("https://storage.test/tenants/t/assets/123e4567-e89b-12d3-a456-426614174000/original-image.png?signature=abc")).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(getAssetIdFromAssetUrl("/api/v2/assets/asset-from-bytes/bytes?variantKey=preview")).toBe("asset-from-bytes");
    expect(getPreferredImageDownloadAssetId({
      nodeAssetId: "node-cover-asset",
      resultId: "asset:selected-result-asset",
    })).toBe("selected-result-asset");
  });

  it("downloads the original asset from a presigned url instead of proxying full bytes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T09:08:07.000Z"));
    getAssetDownloadUrlMock.mockResolvedValue({
      expiresAt: "2026-06-19T09:18:07.000Z",
      method: "GET",
      url: "https://oss.test/original-pig.png?signature=abc",
    });

    const { buildAittcoImageDownloadFilename, downloadOriginalImage } = await import("./imageDownload");

    expect(buildAittcoImageDownloadFilename({
      extension: "png",
      prompt: "happy pig sports day",
      sequence: 2,
    })).toBe("AIttco_20260619_happypigspor_02.png");

    await downloadOriginalImage({
      assetId: "asset-pig",
      fallbackUrl: "https://cdn.test/previews/pig-preview.webp",
      mimeType: "image/png",
      prompt: "happy pig sports day",
      sequence: 2,
    });

    expect(getAssetDownloadUrlMock).toHaveBeenCalledWith("asset-pig");
    expect(triggerBrowserDownloadMock).toHaveBeenCalledWith(
      "https://oss.test/original-pig.png?signature=abc",
      "AIttco_20260619_happypigspor_02.png",
    );
    expect(downloadImageMock).not.toHaveBeenCalled();
  });

  it("deduplicates repeated original asset downloads while the first one is still preparing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T09:08:07.000Z"));
    let resolveDownloadUrl: (value: { expiresAt: string; method: "GET"; url: string }) => void = () => undefined;
    getAssetDownloadUrlMock.mockReturnValue(
      new Promise((resolve) => {
        resolveDownloadUrl = resolve;
      }),
    );

    const { downloadOriginalImage } = await import("./imageDownload");

    const first = downloadOriginalImage({
      assetId: "asset-pig",
      fallbackUrl: "https://cdn.test/previews/pig-preview.webp",
      mimeType: "image/png",
      prompt: "pig",
      sequence: 1,
    });
    const second = downloadOriginalImage({
      assetId: "asset-pig",
      fallbackUrl: "https://cdn.test/previews/pig-preview.webp",
      mimeType: "image/png",
      prompt: "pig",
      sequence: 1,
    });

    expect(getAssetDownloadUrlMock).toHaveBeenCalledTimes(1);
    expect(document.getElementById("aittco-original-download-notice")?.textContent).toBe("原图下载已在准备中...");

    resolveDownloadUrl({
      expiresAt: "2026-06-19T09:18:07.000Z",
      method: "GET",
      url: "https://oss.test/original-pig.png?signature=abc",
    });
    await Promise.all([first, second]);

    expect(triggerBrowserDownloadMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the visible url when an original asset url is unavailable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T09:08:07.000Z"));

    const { downloadOriginalImage } = await import("./imageDownload");

    await downloadOriginalImage({
      assetId: "",
      fallbackUrl: "https://cdn.test/previews/pig-preview.webp",
      mimeType: "image/png",
      prompt: "",
      sequence: 1,
    });

    expect(downloadImageMock).toHaveBeenCalledWith(
      "https://cdn.test/previews/pig-preview.webp",
      expect.stringMatching(/^Aittco_20260619_.+_01\.webp$/),
    );
    expect(triggerBrowserDownloadMock).not.toHaveBeenCalled();
  });

  it("falls back to same-origin asset bytes when presigned downloads are unavailable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T09:08:07.000Z"));
    getAssetDownloadUrlMock.mockRejectedValue(new Error("signing failed"));

    const { downloadOriginalImage } = await import("./imageDownload");

    await downloadOriginalImage({
      fallbackUrl: "https://storage.test/tenants/t/assets/123e4567-e89b-12d3-a456-426614174000/original-image.png?signature=abc",
      mimeType: "image/png",
      prompt: "happy pig",
      sequence: 1,
    });

    expect(downloadImageMock).toHaveBeenCalledWith(
      "/api/v2/assets/123e4567-e89b-12d3-a456-426614174000/bytes",
      "AIttco_20260619_happypig_01.png",
    );
    expect(triggerBrowserDownloadMock).not.toHaveBeenCalled();
  });
});
