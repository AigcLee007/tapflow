import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createSafeDefaultVideoCapabilities } from "./videoGenerationCapabilities";
import { VideoModeMenu } from "./VideoModeMenu";

describe("VideoModeMenu", () => {
  test("renders the LibTV-style mode menu with a title, compact rows, and no descriptions", () => {
    const onChange = vi.fn();
    render(<VideoModeMenu capabilities={createSafeDefaultVideoCapabilities()} onChange={onChange} value="text_to_video" />);

    const trigger = screen.getByRole("button", { name: "生成模式" });
    expect(trigger.className).toContain("bg-white/[0.06]");
    expect(trigger.style.height).toBe("28px");
    expect(trigger.style.borderRadius).toBe("9999px");
    expect(trigger.querySelector(".lucide-chevron-down")).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.getByText("视频生成模式")).toBeTruthy();
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(5);
    const firstLastMode = screen.getByRole("menuitemradio", { name: /首尾帧生视频/ });
    expect(firstLastMode.className).toContain("h-[48px]");
    expect(screen.queryByText("根据首帧和尾帧生成视频")).toBeNull();
    fireEvent.click(firstLastMode);
    expect(onChange).toHaveBeenCalledWith("first_last_frame");
  });

  test("marks modes unsupported by the selected route as disabled with a Chinese reason", () => {
    const capabilities = createSafeDefaultVideoCapabilities();
    capabilities.supportedModes = ["text_to_video"];
    render(<VideoModeMenu capabilities={capabilities} onChange={vi.fn()} value="text_to_video" />);

    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    const unsupported = screen.getByRole("menuitemradio", { name: /首尾帧生视频/ });
    expect(unsupported).toHaveProperty("disabled", true);
    expect(unsupported.getAttribute("title")).toBe("当前模型暂不支持");
  });

  test("opens above its trigger and closes with Escape", () => {
    render(<VideoModeMenu capabilities={createSafeDefaultVideoCapabilities()} onChange={vi.fn()} value="text_to_video" />);
    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    expect(screen.getByRole("menu").className).toContain("bottom-[calc(100%+8px)]");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("closes an open menu and blocks changes when disabled", () => {
    const onChange = vi.fn();
    const { rerender } = render(<VideoModeMenu capabilities={createSafeDefaultVideoCapabilities()} onChange={onChange} value="text_to_video" />);
    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    rerender(<VideoModeMenu capabilities={createSafeDefaultVideoCapabilities()} disabled onChange={onChange} value="text_to_video" />);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
