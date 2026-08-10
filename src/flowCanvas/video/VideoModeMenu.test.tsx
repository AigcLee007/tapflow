import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { VideoModeMenu } from "./VideoModeMenu";
import type { VideoModeAvailabilityResult } from "./videoTypes";

const availability = (overrides: Partial<VideoModeAvailabilityResult> = {}): VideoModeAvailabilityResult => ({
  counts: { audio: 0, image: 0, text: 1, total: 0, video: 0 },
  items: [
    { enabled: true, inputAllowed: true, mode: "text_to_video", modelSupported: true, reason: null },
    { enabled: false, inputAllowed: false, mode: "all_reference", modelSupported: true, reason: "INPUT_REQUIRES_MEDIA" },
    { enabled: false, inputAllowed: false, mode: "image_to_video", modelSupported: true, reason: "INPUT_REQUIRES_EXACTLY_ONE_IMAGE" },
    { enabled: false, inputAllowed: false, mode: "first_last_frame", modelSupported: true, reason: "INPUT_REQUIRES_ONE_OR_TWO_IMAGES" },
    { enabled: false, inputAllowed: false, mode: "image_reference", modelSupported: true, reason: "INPUT_REQUIRES_IMAGE" },
  ],
  recommendedMode: "text_to_video",
  ...overrides,
});

describe("VideoModeMenu", () => {
  test("always renders five compact mode rows and changes only enabled modes", () => {
    const onChange = vi.fn();
    render(<VideoModeMenu availability={availability()} onChange={onChange} value="text_to_video" />);

    const trigger = screen.getByRole("button", { name: "生成模式" });
    expect(trigger.className).toContain("bg-white/[0.06]");
    expect(trigger.style.height).toBe("28px");
    expect(trigger.style.borderRadius).toBe("9999px");
    expect(trigger.querySelector(".lucide-chevron-down")).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.getByText("视频生成模式")).toBeTruthy();
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(5);
    const textMode = screen.getByRole("menuitemradio", { name: /文生视频/ });
    expect(textMode.className).toContain("h-[38px]");
    fireEvent.click(textMode);
    expect(onChange).toHaveBeenCalledWith("text_to_video");
  });

  test("uses availability to mark disabled modes without native disabled and blocks clicks", () => {
    const onChange = vi.fn();
    render(<VideoModeMenu availability={availability()} onChange={onChange} value="text_to_video" />);

    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    const imageToVideo = screen.getByRole("menuitemradio", { name: /图生视频/ });
    expect(imageToVideo.getAttribute("aria-disabled")).toBe("true");
    expect(imageToVideo).not.toHaveProperty("disabled", true);
    fireEvent.click(imageToVideo);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("shows the exact contextual reason on hover and focus, then dismisses it", () => {
    render(<VideoModeMenu availability={availability({ counts: { audio: 0, image: 2, text: 1, total: 2, video: 0 } })} onChange={vi.fn()} value="text_to_video" />);
    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    const imageToVideo = screen.getByRole("menuitemradio", { name: /图生视频/ });
    fireEvent.mouseEnter(imageToVideo);
    expect(screen.getByRole("tooltip").textContent).toContain("图生视频需要恰好 1 张图片（当前 2 张）");
    fireEvent.mouseLeave(imageToVideo);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(imageToVideo);
    expect(screen.getByRole("tooltip").textContent).toContain("图生视频需要恰好 1 张图片（当前 2 张）");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    fireEvent.focus(imageToVideo);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("closes an open menu and blocks changes when disabled", () => {
    const onChange = vi.fn();
    const { rerender } = render(<VideoModeMenu availability={availability()} onChange={onChange} value="text_to_video" />);
    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    rerender(<VideoModeMenu availability={availability()} disabled onChange={onChange} value="text_to_video" />);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
