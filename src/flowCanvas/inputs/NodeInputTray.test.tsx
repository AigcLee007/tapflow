import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    fireEvent.click(screen.getByRole("menuitem", { name: /Script A/ }));
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
    expect(screen.queryByRole("tooltip", { name: "预览 Reference image" })).toBeNull();

    rerender(<NodeInputTray items={[videoA]} />);
    fireEvent.mouseEnter(screen.getByTitle("Clip"));
    expect(screen.getByLabelText("视频预览 Clip")).not.toBeNull();
  });

  it("dismisses a pointer-open asset preview with global Escape", async () => {
    render(<NodeInputTray items={[imageA]} />);

    fireEvent.mouseEnter(screen.getByTitle("Reference image"));
    await waitFor(() => expect(screen.getByRole("tooltip", { name: "预览 Reference image" })).not.toBeNull());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip", { name: "预览 Reference image" })).toBeNull());
  });

  it("closes a preview when its hovered input is removed", async () => {
    const { rerender } = render(<NodeInputTray items={[imageA]} />);
    fireEvent.mouseEnter(screen.getByTitle("Reference image"));
    await waitFor(() => expect(screen.getByRole("tooltip", { name: "预览 Reference image" })).not.toBeNull());

    rerender(<NodeInputTray items={[]} />);
    await waitFor(() => expect(screen.queryByRole("tooltip", { name: "预览 Reference image" })).toBeNull());
  });

  it("updates an open preview when the same input receives a new preview URL", async () => {
    const { rerender } = render(<NodeInputTray items={[imageA]} />);
    fireEvent.mouseEnter(screen.getByTitle("Reference image"));
    await waitFor(() => expect(screen.getByRole("img", { name: "Reference image" }).getAttribute("src")).toBe(imageA.hoverPreviewUrl));

    rerender(<NodeInputTray items={[{ ...imageA, hoverPreviewUrl: "https://cdn.test/image-updated.png" }]} />);
    await waitFor(() => expect(screen.getByRole("img", { name: "Reference image" }).getAttribute("src")).toBe("https://cdn.test/image-updated.png"));
  });

  it("does not open a preview from disabled pointer or focus interactions", () => {
    render(<NodeInputTray disabled items={[imageA]} />);

    const card = screen.getByTitle("Reference image");
    fireEvent.mouseEnter(card);
    fireEvent.focus(card);
    expect(screen.queryByRole("tooltip", { name: "预览 Reference image" })).toBeNull();
  });

  it("anchors text and overflow portals to their triggers within the viewport", () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    const media = Array.from({ length: 8 }, (_, index) => ({ ...imageA, assetId: `image-${index}`, inputKey: `asset:image-${index}`, order: index + 1, title: `Image ${index}` }));
    render(<NodeInputTray items={[textA, ...media]} />);

    const textTrigger = screen.getByRole("button", { name: "文本输入，共 1 个节点" });
    vi.spyOn(textTrigger, "getBoundingClientRect").mockReturnValue({ bottom: 760, height: 52, left: 900, right: 952, top: 708, width: 52, x: 900, y: 708, toJSON: () => ({}) });
    fireEvent.mouseEnter(textTrigger);
    const textMenu = screen.getByRole("menu", { name: "文本输入节点" });
    vi.spyOn(textMenu, "getBoundingClientRect").mockReturnValue({ bottom: 0, height: 300, left: 0, right: 260, top: 0, width: 260, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent(window, new Event("resize"));
    expect(textMenu.style.position).toBe("fixed");
    expect(textMenu.style.visibility).toBe("visible");
    expect(textMenu.style.left).toBe("692px");
    expect(textMenu.style.top).toBe("402px");

    const overflowTrigger = screen.getByRole("button", { name: "显示另外 1 个输入" });
    vi.spyOn(overflowTrigger, "getBoundingClientRect").mockReturnValue({ bottom: 760, height: 52, left: 900, right: 952, top: 708, width: 52, x: 900, y: 708, toJSON: () => ({}) });
    fireEvent.click(overflowTrigger);
    const overflowMenu = screen.getByRole("menu", { name: "更多输入" });
    vi.spyOn(overflowMenu, "getBoundingClientRect").mockReturnValue({ bottom: 0, height: 300, left: 0, right: 208, top: 0, width: 208, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent(window, new Event("resize"));
    expect(overflowMenu.style.position).toBe("fixed");
    expect(overflowMenu.style.visibility).toBe("visible");
    expect(overflowMenu.style.left).toBe("744px");
    expect(overflowMenu.style.top).toBe("402px");
  });

  it("activates upstream media once per single click and dismisses keyboard-open previews with Escape", async () => {
    const onFocusSource = vi.fn();
    const upstreamImage = { ...imageA, inputKey: "upstream:image-a", source: "upstream" as const, sourceNodeId: "image-a" };
    render(<NodeInputTray items={[upstreamImage]} onFocusSource={onFocusSource} />);

    const card = screen.getByTitle("Reference image");
    fireEvent.click(card);
    fireEvent.doubleClick(card);
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onFocusSource).toHaveBeenCalledTimes(2);
    expect(onFocusSource).toHaveBeenLastCalledWith("upstream:image-a");

    fireEvent.focus(card);
    await waitFor(() => expect(screen.getByRole("tooltip", { name: "预览 Reference image" })).not.toBeNull());
    fireEvent.keyDown(card, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip", { name: "预览 Reference image" })).toBeNull());
    expect(document.activeElement).toBe(card);
  });

  it("closes text and overflow menus when their corresponding inputs are removed", () => {
    const { rerender } = render(<NodeInputTray items={[textA, imageA]} />);
    fireEvent.mouseEnter(screen.getByRole("button", { name: /文本输入/ }));
    expect(screen.getByRole("menu", { name: "文本输入节点" })).not.toBeNull();

    rerender(<NodeInputTray items={[imageA]} />);
    rerender(<NodeInputTray items={[textA, imageA]} />);
    expect(screen.queryByRole("menu", { name: "文本输入节点" })).toBeNull();

    const media = Array.from({ length: 9 }, (_, index) => ({ ...imageA, assetId: `image-${index}`, inputKey: `asset:image-${index}`, order: index, title: `Image ${index}` }));
    rerender(<NodeInputTray items={media} />);
    fireEvent.click(screen.getByRole("button", { name: /显示另外 1 个输入/ }));
    expect(screen.getByRole("menu", { name: "更多输入" })).not.toBeNull();

    rerender(<NodeInputTray items={media.slice(0, 8)} />);
    rerender(<NodeInputTray items={media} />);
    expect(screen.queryByRole("menu", { name: "更多输入" })).toBeNull();
  });

  it("renders first and last frame role badges", () => {
    render(<NodeInputTray items={[
      { ...imageA, inputKey: "asset:first", order: 0, role: "first_frame", title: "First" },
      { ...imageA, inputKey: "asset:last", order: 1, role: "last_frame", title: "Last" },
    ]} />);

    expect(screen.getByLabelText("输入角色：首帧")).not.toBeNull();
    expect(screen.getByLabelText("输入角色：尾帧")).not.toBeNull();
  });

  it("opens an asset preview from keyboard focus and associates it as a tooltip", async () => {
    render(<NodeInputTray items={[imageA]} />);

    const card = screen.getByRole("button", { name: "输入 3：Reference image" });
    fireEvent.focus(card);
    await waitFor(() => expect(screen.getByRole("tooltip", { name: "预览 Reference image" })).not.toBeNull());
    const preview = screen.getByRole("tooltip", { name: "预览 Reference image" });
    expect(card.getAttribute("aria-describedby")).toBe(preview.id);
  });

  it("keeps upstream media focusable in the overflow menu", () => {
    const onFocusSource = vi.fn();
    const media = Array.from({ length: 9 }, (_, index) => ({ ...imageA, inputKey: `upstream:image-${index}`, order: index, source: "upstream" as const, sourceNodeId: `image-${index}`, title: `Image ${index}` }));
    render(<NodeInputTray items={media} onFocusSource={onFocusSource} />);

    fireEvent.click(screen.getByRole("button", { name: "显示另外 1 个输入" }));
    const focusRow = screen.getByRole("menuitem", { name: "聚焦输入 9：Image 8" });
    fireEvent.click(focusRow);
    fireEvent.keyDown(focusRow, { key: "Enter" });
    expect(onFocusSource).toHaveBeenCalledTimes(2);
    expect(onFocusSource).toHaveBeenLastCalledWith("upstream:image-8");
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
