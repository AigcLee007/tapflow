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
      "https://tapflow-staging-assets.oss-ap-northeast-1.aliyuncs.com/tenants/t/assets/asset-1/original.png?signature=abc",
      "AIttco_20260619_动物运动会_01.png",
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(consoleErrorMock).toHaveBeenCalledWith("Download failed:", expect.any(Error));
    expect(clickMock).toHaveBeenCalledOnce();
    expect(openMock).not.toHaveBeenCalled();
    expect(clickedHref).toBe(
      "https://tapflow-staging-assets.oss-ap-northeast-1.aliyuncs.com/tenants/t/assets/asset-1/original.png?signature=abc",
    );
    expect(clickedDownload).toBe("AIttco_20260619_动物运动会_01.png");
    expect(document.body.querySelector("a")).toBeNull();
  });
});
