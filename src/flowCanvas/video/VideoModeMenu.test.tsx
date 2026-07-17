import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createSafeDefaultVideoCapabilities } from "./videoGenerationCapabilities";
import { VideoModeMenu } from "./VideoModeMenu";

describe("VideoModeMenu", () => {
  test("renders five Chinese radio rows and selects the first and last frame mode", () => {
    const onChange = vi.fn();
    render(<VideoModeMenu capabilities={createSafeDefaultVideoCapabilities()} onChange={onChange} value="text_to_video" />);

    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(5);
    const firstLastMode = screen.getByRole("menuitemradio", { name: /首尾帧生视频/ });
    expect(firstLastMode.textContent).toContain("根据首帧和尾帧生成视频");
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
    expect(screen.getAllByText("当前模型暂不支持").length).toBeGreaterThan(0);
  });

  test("uses the shared dismissal layer and shared 38px menu row density", () => {
    render(<VideoModeMenu capabilities={createSafeDefaultVideoCapabilities()} onChange={vi.fn()} value="text_to_video" />);
    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    expect(screen.getByRole("menuitemradio", { name: /文生视频/ }).className).toContain("h-[38px]");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
