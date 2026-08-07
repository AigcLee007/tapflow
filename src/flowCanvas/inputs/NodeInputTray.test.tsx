import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CanvasInputItem } from "./canvasInputProjection";
import { NodeInputTray } from "./NodeInputTray";
import { IMAGE_MENU_SURFACE_Z_INDEX } from "../nodes/imageMenuStyles";

const items: CanvasInputItem[] = [
  { inputKey: "upstream:text", kind: "text", order: 0, previewState: "ready", source: "upstream", textExcerpt: "A very useful prompt", title: "Prompt upstream" },
  { assetId: "asset-image", inputKey: "asset:asset-image", kind: "image", order: 1, previewState: "ready", previewUrl: "https://cdn.test/image.png", source: "asset", title: "Reference image" },
  { assetId: "asset-video", inputKey: "asset:asset-video", kind: "video", order: 2, previewState: "ready", previewUrl: "https://cdn.test/video.png", role: "first_frame", source: "asset", title: "Clip", durationMs: 1250 },
  { assetId: "asset-audio", inputKey: "asset:asset-audio", kind: "audio", order: 3, previewState: "unavailable", role: "last_frame", source: "asset", title: "Narration", durationMs: 2300 },
  ...Array.from({ length: 5 }, (_, index) => ({ inputKey: `upstream:extra-${index}`, kind: "text" as const, order: index + 4, previewState: "ready" as const, source: "upstream" as const, title: `Extra ${index}` })),
];

describe("NodeInputTray", () => {
  it("renders stable, accessible cards with media roles, overflow, focus, remove and retry actions", () => {
    const onFocusSource = vi.fn();
    const onRemove = vi.fn();
    const onRetryPreview = vi.fn();
    render(<NodeInputTray items={[...items.slice(0, 4), { ...items[0], inputKey: "upstream:error", order: 4, previewState: "error", title: "Failed text" }, ...items.slice(4)]} onFocusSource={onFocusSource} onRemove={onRemove} onRetryPreview={onRetryPreview} />);

    const first = screen.getByLabelText("输入 1：Prompt upstream");
    expect(first.className).toContain("h-[52px]");
    expect(first.className).toContain("w-[52px]");
    expect(first.getAttribute("title")).toBe("A very useful prompt");
    fireEvent.doubleClick(first);
    expect(onFocusSource).toHaveBeenCalledWith("upstream:text");

    fireEvent.click(screen.getByRole("button", { name: "移除输入 2：Reference image" }));
    expect(onRemove).toHaveBeenCalledWith("asset:asset-image");
    fireEvent.click(screen.getByRole("button", { name: "重试预览 5：Failed text" }));
    expect(onRetryPreview).toHaveBeenCalledWith("upstream:error");
    expect(screen.getByText("首帧")).not.toBeNull();
    expect(screen.getByText("尾帧")).not.toBeNull();
    expect(screen.getByText("1.3s")).not.toBeNull();
    expect(screen.getByText("+2")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "显示另外 2 个输入" }));
    expect(screen.getByRole("menu", { name: "更多输入" })).not.toBeNull();
  });

  it("emits one complete order on drop and blocks mutation actions when disabled", () => {
    const onReorder = vi.fn();
    const onRemove = vi.fn();
    const { rerender } = render(<NodeInputTray items={items.slice(0, 3)} onRemove={onRemove} onReorder={onReorder} />);
    const firstCard = screen.getByLabelText("输入 1：Prompt upstream");
    const thirdCard = screen.getByLabelText("输入 3：Clip");
    fireEvent.dragStart(firstCard, { dataTransfer: { setData: vi.fn() } });
    fireEvent.drop(thirdCard, { dataTransfer: { getData: () => "upstream:text" } });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["asset:asset-image", "asset:asset-video", "upstream:text"]);

    rerender(<NodeInputTray disabled items={items.slice(0, 2)} onRemove={onRemove} onReorder={onReorder} />);
    expect((screen.getByRole("button", { name: "移除输入 1：Prompt upstream" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.dragStart(screen.getByLabelText("输入 1：Prompt upstream"), { dataTransfer: { setData: vi.fn() } });
    fireEvent.drop(screen.getByLabelText("输入 2：Reference image"), { dataTransfer: { getData: () => "upstream:text" } });
    expect(onReorder).toHaveBeenCalledTimes(1);
  });

  it("blocks every input action when disabled", () => {
    const onFocusSource = vi.fn();
    const onRetryPreview = vi.fn();
    const onRemove = vi.fn();
    render(<NodeInputTray disabled items={[{ ...items[0], previewState: "error" }]} onFocusSource={onFocusSource} onRemove={onRemove} onRetryPreview={onRetryPreview} />);

    const card = screen.getByLabelText("输入 1：Prompt upstream");
    fireEvent.doubleClick(card);
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "重试预览 1：Prompt upstream" }));
    expect(onFocusSource).not.toHaveBeenCalled();
    expect(onRetryPreview).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("uses non-nested card controls and exposes actionable overflow entries that dismiss on outside click and Escape", () => {
    const onFocusSource = vi.fn();
    const overflow = Array.from({ length: 9 }, (_, index) => ({
      inputKey: `upstream:${index}`,
      kind: "text" as const,
      order: index,
      previewState: "ready" as const,
      source: "upstream" as const,
      title: `Overflow ${index}`,
    }));
    const { container } = render(<NodeInputTray items={overflow} onFocusSource={onFocusSource} />);

    const card = screen.getByLabelText("输入 1：Overflow 0");
    expect(card.querySelector("button")).toBeNull();
    fireEvent.keyDown(card, { key: " " });
    expect(onFocusSource).toHaveBeenCalledWith("upstream:0");

    fireEvent.click(screen.getByRole("button", { name: "显示另外 1 个输入" }));
    const overflowFocus = screen.getByRole("menuitem", { name: "聚焦输入 9：Overflow 8" });
    fireEvent.click(overflowFocus);
    expect(onFocusSource).toHaveBeenCalledWith("upstream:8");
    expect(screen.getByRole("menu", { name: "更多输入" })).not.toBeNull();
    fireEvent.pointerDown(container.ownerDocument.body);
    expect(screen.queryByRole("menu", { name: "更多输入" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "显示另外 1 个输入" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "更多输入" })).toBeNull();
  });

  it("assigns each overflow menu a unique dismissible-layer identity", () => {
    const firstItems = Array.from({ length: 9 }, (_, index) => ({
      inputKey: `upstream:first-${index}`,
      kind: "text" as const,
      order: index,
      previewState: "ready" as const,
      source: "upstream" as const,
      title: `First ${index}`,
    }));
    const secondItems = Array.from({ length: 9 }, (_, index) => ({
      inputKey: `upstream:second-${index}`,
      kind: "text" as const,
      order: index,
      previewState: "ready" as const,
      source: "upstream" as const,
      title: `Second ${index}`,
    }));
    render(<><NodeInputTray items={firstItems} onFocusSource={vi.fn()} /><NodeInputTray items={secondItems} onFocusSource={vi.fn()} /></>);

    const triggers = screen.getAllByRole("button", { name: "显示另外 1 个输入" });
    fireEvent.click(triggers[0]);
    expect(screen.getByRole("menuitem", { name: "聚焦输入 9：First 8" })).not.toBeNull();

    fireEvent.click(triggers[1]);
    expect(screen.queryByRole("menuitem", { name: "聚焦输入 9：First 8" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "聚焦输入 9：Second 8" })).not.toBeNull();
  });

  it("reorders an overflow input with its complete input-key order", () => {
    const onReorder = vi.fn();
    const overflow = Array.from({ length: 9 }, (_, index) => ({ inputKey: `upstream:${index}`, kind: "text" as const, order: index, previewState: "ready" as const, source: "upstream" as const, title: `Input ${index}` }));
    render(<NodeInputTray items={overflow} onFocusSource={vi.fn()} onReorder={onReorder} />);

    fireEvent.click(screen.getByRole("button", { name: "显示另外 1 个输入" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "上移输入 9：Input 8" }));

    expect(onReorder).toHaveBeenCalledWith([
      "upstream:0", "upstream:1", "upstream:2", "upstream:3", "upstream:4", "upstream:5", "upstream:6", "upstream:8", "upstream:7",
    ]);
  });

  it("clears drag state on dragend so cancelled or external drops cannot reorder", () => {
    const onReorder = vi.fn();
    render(<NodeInputTray items={items.slice(0, 3)} onReorder={onReorder} />);
    const first = screen.getByLabelText("输入 1：Prompt upstream");
    const third = screen.getByLabelText("输入 3：Clip");

    fireEvent.dragStart(first, { dataTransfer: { setData: vi.fn() } });
    fireEvent.dragEnd(first);
    fireEvent.drop(third, { dataTransfer: { getData: () => "upstream:text" } });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("announces upstream cards as buttons without nesting mutation buttons and constrains the overflow surface", () => {
    const overflow = Array.from({ length: 9 }, (_, index) => ({ inputKey: `upstream:${index}`, kind: "text" as const, order: index, previewState: "ready" as const, source: "upstream" as const, title: `Input ${index}` }));
    render(<NodeInputTray items={overflow} onFocusSource={vi.fn()} onRemove={vi.fn()} />);

    const card = screen.getByRole("button", { name: "输入 1：Input 0" });
    expect(card.getAttribute("tabindex")).toBe("0");
    expect(card.querySelector("button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "显示另外 1 个输入" }));
    const menu = screen.getByRole("menu", { name: "更多输入" });
    expect(menu.className).toContain("max-h-");
    expect(menu.className).toContain("overflow-y-auto");
    expect(menu.className).toContain("overflow-x-hidden");
  });

  it("flips the overflow flyout above a bottom-positioned trigger and clamps it to the viewport", () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    const overflow = Array.from({ length: 9 }, (_, index) => ({ inputKey: `upstream:${index}`, kind: "text" as const, order: index, previewState: "ready" as const, source: "upstream" as const, title: `Input ${index}` }));
    render(<NodeInputTray items={overflow} onFocusSource={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "显示另外 1 个输入" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({ bottom: 760, height: 52, left: 900, right: 952, top: 708, width: 52, x: 900, y: 708, toJSON: () => ({}) });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "更多输入" });
    vi.spyOn(menu, "getBoundingClientRect").mockReturnValue({ bottom: 0, height: 300, left: 0, right: 208, top: 0, width: 208, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent(window, new Event("resize"));

    expect(menu.style.position).toBe("fixed");
    expect(menu.style.top).toBe("402px");
    expect(menu.style.left).toBe("744px");
  });

  it("portals the overflow flyout outside transformed canvas ancestors", () => {
    const overflow = Array.from({ length: 9 }, (_, index) => ({ inputKey: `upstream:${index}`, kind: "text" as const, order: index, previewState: "ready" as const, source: "upstream" as const, title: `Input ${index}` }));
    const { container } = render(<div data-testid="transformed-canvas" style={{ transform: "translate(20px, 20px)" }}><NodeInputTray items={overflow} onFocusSource={vi.fn()} /></div>);

    fireEvent.click(screen.getByRole("button", { name: "显示另外 1 个输入" }));
    const menu = screen.getByRole("menu", { name: "更多输入" });
    const transformedCanvas = container.querySelector('[data-testid="transformed-canvas"]');

    expect(menu.parentElement).toBe(document.body);
    expect(transformedCanvas?.contains(menu)).toBe(false);
    expect(menu.style.zIndex).toBe(String(IMAGE_MENU_SURFACE_Z_INDEX));
  });
});
