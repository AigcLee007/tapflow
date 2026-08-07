import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CanvasInputItem } from "./canvasInputProjection";
import { MediaHoverPreview } from "./MediaHoverPreview";

const rect = (values: Partial<DOMRect>): DOMRect => ({
  bottom: 80,
  height: 48,
  left: 16,
  right: 64,
  top: 32,
  width: 48,
  x: 16,
  y: 32,
  toJSON: () => ({}),
  ...values,
});

const imageItem: CanvasInputItem = {
  assetId: "image-1",
  hoverPreviewUrl: "https://cdn.test/image-full.png",
  inputKey: "asset:image-1",
  kind: "image",
  order: 0,
  previewState: "ready",
  source: "asset",
  thumbnailUrl: "https://cdn.test/image-thumb.webp",
  title: "Reference image",
};

const videoItem: CanvasInputItem = {
  ...imageItem,
  assetId: "video-1",
  hoverPreviewUrl: "https://cdn.test/clip.mp4",
  inputKey: "asset:video-1",
  kind: "video",
  thumbnailUrl: "https://cdn.test/clip.webp",
  title: "Clip",
};

describe("MediaHoverPreview", () => {
  it("portals an image preview and clamps it to the viewport", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    const trigger = document.createElement("button");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rect({ left: 350, right: 382, top: 760, bottom: 812 }));

    render(<MediaHoverPreview item={imageItem} open trigger={trigger} />);

    const preview = screen.getByRole("dialog", { name: "预览 Reference image" });
    expect(preview.parentElement).toBe(document.body);
    expect(Number.parseFloat(preview.style.left)).toBeLessThanOrEqual(382);
    expect(screen.getByRole("img", { name: "Reference image" }).getAttribute("src")).toBe(imageItem.hoverPreviewUrl);
  });

  it("plays muted video on open and pauses and resets it on close", async () => {
    const trigger = document.createElement("button");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rect({}));
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const { rerender } = render(<MediaHoverPreview item={videoItem} open trigger={trigger} />);
    const video = screen.getByLabelText("视频预览 Clip") as HTMLVideoElement;

    expect(video.muted).toBe(true);
    expect(video.getAttribute("playsinline")).not.toBeNull();
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.getAttribute("poster")).toBe(videoItem.thumbnailUrl);
    await waitFor(() => expect(play).toHaveBeenCalled());
    Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 3 });

    rerender(<MediaHoverPreview item={videoItem} open={false} trigger={trigger} />);

    expect(pause).toHaveBeenCalled();
    expect(video.currentTime).toBe(0);
  });
});
