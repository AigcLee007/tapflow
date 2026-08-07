import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CanvasInputItem } from "./canvasInputProjection";
import { NodeInputTray } from "./NodeInputTray";

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
});
