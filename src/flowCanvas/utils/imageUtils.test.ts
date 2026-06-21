import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadImage } from "./imageUtils";

describe("downloadImage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("falls back to a hidden download anchor instead of opening a new tab", async () => {
    const openMock = vi.fn();
    const consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => {
      throw new Error("CORS blocked");
    });
    let clickedHref = "";
    let clickedDownload = "";
    const clickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function click(this: HTMLAnchorElement) {
        clickedHref = this.href;
        clickedDownload = this.download;
      });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("open", openMock);

    await downloadImage(
      "https://storage.test/tenants/t/assets/asset-1/original.png?signature=abc",
      "AIttco_20260619_image_01.png",
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(consoleErrorMock).toHaveBeenCalledWith("Download failed:", expect.any(Error));
    expect(clickMock).toHaveBeenCalledOnce();
    expect(openMock).not.toHaveBeenCalled();
    expect(clickedHref).toBe(
      "https://storage.test/tenants/t/assets/asset-1/original.png?signature=abc",
    );
    expect(clickedDownload).toBe("AIttco_20260619_image_01.png");
    expect(document.body.querySelector("a")).toBeNull();
  });

  it("can disable direct url fallback so callers avoid navigating to cross-origin image pages", async () => {
    const consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => {
      throw new Error("CORS blocked");
    });
    const clickMock = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadImage(
      "https://art.cn-nb1.rains3.com/tenants/t/assets/asset-1/original.png?signature=abc",
      "AIttco_20260621_image_01.png",
      { fallbackToUrl: false },
    )).rejects.toThrow("CORS blocked");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(clickMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).not.toHaveBeenCalled();
  });
});
