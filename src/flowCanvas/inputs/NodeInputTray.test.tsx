import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CanvasInputItem } from "./canvasInputProjection";
import { NodeInputTray } from "./NodeInputTray";

const textA: CanvasInputItem = {
  inputKey: "upstream:text-a", kind: "text", order: 0, previewState: "ready", source: "upstream", textExcerpt: "A useful script", title: "Script A",
};
const textB: CanvasInputItem = {
  inputKey: "upstream:text-b", kind: "text", order: 1, previewState: "ready", source: "upstream", textExcerpt: "Another script", title: "Script B",
};
const imageA: CanvasInputItem = {
  assetId: "image-a", hoverPreviewUrl: "https://cdn.test/image-full.png", inputKey: "asset:image-a", kind: "image", order: 2, previewState: "ready", previewUrl: "https://cdn.test/image-thumb.webp", source: "asset", thumbnailUrl: "https://cdn.test/image-thumb.webp", title: "Reference image",
};
const videoA: CanvasInputItem = {
  assetId: "video-a", hoverPreviewUrl: "https://cdn.test/clip.mp4", inputKey: "asset:video-a", kind: "video", order: 3, previewState: "ready", previewUrl: "https://cdn.test/clip.webp", source: "asset", thumbnailUrl: "https://cdn.test/clip.webp", title: "Clip",
};

describe("NodeInputTray", () => {
  it("renders one first-position text group with source actions", () => {
    const onFocusSource = vi.fn();
    const onRemove = vi.fn();
    const onRemoveAllText = vi.fn();
    render(<NodeInputTray items={[textA, imageA, textB, videoA]} onFocusSource={onFocusSource} onRemove={onRemove} onRemoveAllText={onRemoveAllText} />);

    const textGroup = screen.getByRole("button", { name: "文本输入，共 2 个节点" });
    expect(textGroup.getAttribute("draggable")).not.toBe("true");
    expect(screen.getAllByTestId("media-input-card").map((node) => node.querySelector("[title]")?.getAttribute("title"))).toEqual(["Reference image", "Clip"]);

    fireEvent.mouseEnter(textGroup);
    expect(screen.getByRole("menu", { name: "文本输入节点" })).not.toBeNull();
    fireEvent.doubleClick(screen.getByRole("menuitem", { name: /Script A/ }));
    expect(onFocusSource).toHaveBeenCalledWith("upstream:text-a");
    fireEvent.click(screen.getByRole("button", { name: "移除输入 Script B" }));
    expect(onRemove).toHaveBeenCalledWith("upstream:text-b");
    fireEvent.click(screen.getByRole("menuitem", { name: "移除全部文本输入" }));
    expect(onRemoveAllText).toHaveBeenCalledTimes(1);
  });

  it("emits media keys only and ignores drag attempts from the text group", () => {
    const onReorder = vi.fn();
    render(<NodeInputTray items={[textA, imageA, videoA]} onReorder={onReorder} />);

    const textGroup = screen.getByRole("button", { name: /文本输入/ });
    fireEvent.dragStart(textGroup, { dataTransfer: { setData: vi.fn() } });
    fireEvent.drop(screen.getByTitle("Reference image"), { dataTransfer: { getData: () => "upstream:text-a" } });
    expect(onReorder).not.toHaveBeenCalled();

    fireEvent.dragStart(screen.getByTitle("Clip"), { dataTransfer: { setData: vi.fn() } });
    fireEvent.drop(screen.getByTitle("Reference image"), { dataTransfer: { getData: () => "asset:video-a" } });
    expect(onReorder).toHaveBeenCalledWith(["asset:image-a", "asset:video-a"]);
  });

  it("limits the tray to eight cells and sends only media to overflow", () => {
    const media = Array.from({ length: 8 }, (_, index) => ({ ...imageA, assetId: `image-${index}`, inputKey: `asset:image-${index}`, order: index + 1, title: `Image ${index}` }));
    render(<NodeInputTray items={[textA, ...media]} onFocusSource={vi.fn()} />);

    expect(screen.getByRole("button", { name: "文本输入，共 1 个节点" })).not.toBeNull();
    expect(screen.getAllByTestId("media-input-card")).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: "显示另外 1 个输入" }));
    expect(screen.getByRole("menu", { name: "更多输入" }).textContent).toContain("Image 7");
  });

  it("opens image and video hover previews", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const { rerender } = render(<NodeInputTray items={[imageA]} />);
    fireEvent.mouseEnter(screen.getByTitle("Reference image"));
    expect(screen.getByRole("img", { name: "Reference image" })).not.toBeNull();
    fireEvent.mouseLeave(screen.getByTitle("Reference image"));
    expect(screen.queryByRole("dialog", { name: "预览 Reference image" })).toBeNull();

    rerender(<NodeInputTray items={[videoA]} />);
    fireEvent.mouseEnter(screen.getByTitle("Clip"));
    expect(screen.getByLabelText("视频预览 Clip")).not.toBeNull();
  });

  it("preserves disabled retry and remove controls", () => {
    const onRetryPreview = vi.fn();
    const onRemove = vi.fn();
    render(<NodeInputTray disabled items={[{ ...imageA, previewState: "error" }]} onRemove={onRemove} onRetryPreview={onRetryPreview} />);

    const retry = screen.getByRole("button", { name: "重试预览 3：Reference image" }) as HTMLButtonElement;
    const remove = screen.getByRole("button", { name: "移除输入 3：Reference image" }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    expect(remove.disabled).toBe(true);
    fireEvent.click(retry);
    fireEvent.click(remove);
    expect(onRetryPreview).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });
});
