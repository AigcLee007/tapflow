import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VideoCameraLibrary } from "./VideoCameraLibrary";
import type { VideoCameraManifest } from "./videoCameraManifest";

const manifest: VideoCameraManifest = {
  version: 1,
  attribution: "TapFlow original",
  items: [
    { id: "fixed", label: "Fixed", poster: "v1/fixed.webp", preview: "v1/fixed.webm", durationMs: 2500, version: 1, attribution: "TapFlow original", codec: "vp9" },
    { id: "dolly-in", label: "Dolly in", poster: "v1/dolly-in.webp", preview: "v1/dolly-in.webm", durationMs: 2500, version: 1, attribution: "TapFlow original", codec: "vp9" },
  ],
};

let pause: ReturnType<typeof vi.fn>;

beforeEach(() => {
  pause = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VideoCameraLibrary", () => {
  it("keeps a card selection temporary until Use commits its stable manifest id", () => {
    const onChange = vi.fn();
    render(<VideoCameraLibrary manifest={manifest} onChange={onChange} onClose={vi.fn()} value={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Dolly in" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Dolly in" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "使用运镜" }));
    expect(onChange).toHaveBeenCalledWith("dolly-in");
  });

  it("filters visible cards without changing their stable IDs and clears a pending choice", () => {
    const onChange = vi.fn();
    render(<VideoCameraLibrary manifest={manifest} onChange={onChange} onClose={vi.fn()} value="fixed" />);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索运镜" }), { target: { value: "dolly" } });
    const dollyCard = screen.getByRole("button", { name: "Dolly in" });
    expect(dollyCard.getAttribute("data-camera-motion-id")).toBe("dolly-in");
    expect(screen.queryByRole("button", { name: "Fixed" })).toBeNull();

    fireEvent.click(dollyCard);
    fireEvent.click(screen.getByRole("button", { name: "清除已选运镜" }));
    fireEvent.click(screen.getByRole("button", { name: "使用运镜" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("closes on outside pointerdown and Escape, pauses previews, and restores trigger focus", () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    const currentTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime");
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", { configurable: true, get: () => 1, set: vi.fn() });

    const { unmount } = render(<VideoCameraLibrary manifest={manifest} onChange={vi.fn()} onClose={onClose} triggerRef={{ current: trigger }} value={null} />);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);

    unmount();
    render(<VideoCameraLibrary manifest={manifest} onChange={vi.fn()} onClose={onClose} triggerRef={{ current: trigger }} value={null} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);

    if (currentTime) Object.defineProperty(HTMLMediaElement.prototype, "currentTime", currentTime);
  });

  it("moves focus into the dialog and wraps Tab navigation within it", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();

    render(<VideoCameraLibrary manifest={manifest} onChange={vi.fn()} onClose={vi.fn()} triggerRef={{ current: trigger }} value={null} />);

    const dialog = screen.getByRole("dialog", { name: "运镜库" });
    const closeButton = screen.getByRole("button", { name: "关闭运镜库" });
    const useButton = screen.getByRole("button", { name: "使用运镜" });

    expect(dialog.contains(document.activeElement)).toBe(true);

    useButton.focus();
    fireEvent.keyDown(useButton, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(useButton);
  });

  it("shows component-local favorites and an empty My motions tab", () => {
    render(<VideoCameraLibrary manifest={manifest} onChange={vi.fn()} onClose={vi.fn()} value={null} />);
    fireEvent.click(screen.getByRole("button", { name: "收藏 Fixed" }));
    fireEvent.click(screen.getByRole("tab", { name: "收藏" }));
    expect(screen.getByRole("button", { name: "Fixed" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "我的运镜" }));
    expect(screen.getByText("暂未创建自定义运镜。")).toBeTruthy();
  });
});
