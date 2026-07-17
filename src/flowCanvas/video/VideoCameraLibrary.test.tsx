import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VideoCameraLibrary } from "./VideoCameraLibrary";
import type { VideoCameraManifest } from "./videoCameraManifest";

const manifest: VideoCameraManifest = {
  version: 1,
  attribution: "TapFlow original",
  items: [
    { id: "fixed", label: "固定镜头", preview: "v2/fixed.mp4", durationMs: 2500, version: 2, attribution: "DramaClaw commercial license", codec: "h264" },
    { id: "dolly-in", label: "镜头前推", preview: "v2/dolly-in.mp4", durationMs: 2500, version: 2, attribution: "DramaClaw commercial license", codec: "h264" },
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
  it("uses stable Chinese labels instead of external manifest labels", () => {
    const hostileManifest: VideoCameraManifest = {
      ...manifest,
      items: [
        { ...manifest.items[0], label: "Fixed" },
        { ...manifest.items[1], label: "Dolly in \uFFFD" },
      ],
    };

    render(<VideoCameraLibrary manifest={hostileManifest} onChange={vi.fn()} onClose={vi.fn()} value="dolly-in" />);

    expect(screen.getByRole("button", { name: "\u56fa\u5b9a\u955c\u5934" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u63a8\u8fdb" })).toBeTruthy();
    expect(screen.getAllByText("\u63a8\u8fdb")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "\u6536\u85cf \u63a8\u8fdb" })).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "\u641c\u7d22\u8fd0\u955c" }), { target: { value: "\u63a8\u8fdb" } });
    expect(screen.getByRole("button", { name: "\u63a8\u8fdb" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("Fixed");
    expect(document.body.textContent).not.toContain("Dolly in");
    expect(document.body.textContent).not.toContain("\uFFFD");
  });

  it("keeps a card selection temporary until Use commits its stable manifest id", () => {
    const onChange = vi.fn();
    render(<VideoCameraLibrary manifest={manifest} onChange={onChange} onClose={vi.fn()} value={null} />);

    fireEvent.click(screen.getByRole("button", { name: "\u63a8\u8fdb" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "\u63a8\u8fdb" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "使用运镜" }));
    expect(onChange).toHaveBeenCalledWith("dolly-in");
  });

  it("filters visible cards without changing their stable IDs and clears a pending choice", () => {
    const onChange = vi.fn();
    render(<VideoCameraLibrary manifest={manifest} onChange={onChange} onClose={vi.fn()} value="fixed" />);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索运镜" }), { target: { value: "dolly" } });
    const dollyCard = screen.getByRole("button", { name: "\u63a8\u8fdb" });
    expect(dollyCard.getAttribute("data-camera-motion-id")).toBe("dolly-in");
    expect(screen.queryByRole("button", { name: "\u56fa\u5b9a\u955c\u5934" })).toBeNull();

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
    fireEvent.click(screen.getByRole("button", { name: "\u6536\u85cf \u56fa\u5b9a\u955c\u5934" }));
    fireEvent.click(screen.getByRole("tab", { name: "收藏" }));
    expect(screen.getByRole("button", { name: "\u56fa\u5b9a\u955c\u5934" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "我的运镜" }));
    expect(screen.getByText("暂未创建自定义运镜。")).toBeTruthy();
  });
});
