import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createSafeDefaultVideoCapabilities } from "./videoGenerationCapabilities";
import { createDefaultVideoGenerationParams } from "./videoGenerationParams";
import { VideoParameterPanel } from "./VideoParameterPanel";

describe("VideoParameterPanel", () => {
  test("offers 4K, duration range and numeric controls, an audio switch tooltip, and 1/2/4 count", () => {
    render(
      <VideoParameterPanel
        capabilities={createSafeDefaultVideoCapabilities()}
        onChange={vi.fn()}
        value={createDefaultVideoGenerationParams()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /清晰度/ }));
    expect(screen.getByRole("menuitem", { name: "4K" })).toBeTruthy();

    expect(screen.getByLabelText("时长滑杆").getAttribute("type")).toBe("range");
    expect(screen.getByLabelText("时长输入").getAttribute("type")).toBe("number");

    const audio = screen.getByRole("switch", { name: "生成音频" });
    expect(audio.getAttribute("aria-describedby")).toBe("video-audio-capability-note");
    fireEvent.mouseEnter(audio);
    expect(screen.getByRole("tooltip").textContent).toContain("生成音频");

    fireEvent.click(screen.getByRole("button", { name: /生成数量/ }));
    expect(screen.getByRole("menuitem", { name: "1" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "2" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "4" })).toBeTruthy();
  });

  test("coerces duration to the selected model limits and step on blur and Enter", () => {
    const onChange = vi.fn();
    const capabilities = createSafeDefaultVideoCapabilities();
    capabilities.minDurationSeconds = 3;
    capabilities.maxDurationSeconds = 7;
    capabilities.durationStepSeconds = 2;

    render(
      <VideoParameterPanel
        capabilities={capabilities}
        onChange={onChange}
        value={createDefaultVideoGenerationParams()}
      />,
    );

    const input = screen.getByLabelText("时长输入");
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ durationSeconds: 7 }));

    fireEvent.change(input, { target: { value: "4" } });
    onChange.mockClear();
    (input as HTMLInputElement).focus();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ durationSeconds: 5 }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test("disables audio generation with an accessible explanation when the selected model does not support audio", () => {
    const capabilities = createSafeDefaultVideoCapabilities();
    capabilities.confirmedByRoute = true;
    capabilities.supportsAudio = false;
    const onChange = vi.fn();

    render(
      <VideoParameterPanel
        capabilities={capabilities}
        onChange={onChange}
        value={createDefaultVideoGenerationParams()}
      />,
    );

    const audio = screen.getByRole("switch", { name: "生成音频" });
    expect(audio.getAttribute("disabled")).not.toBeNull();
    expect(audio.getAttribute("aria-describedby")).toBe("video-audio-capability-note");
    const explanation = document.getElementById("video-audio-capability-note");
    expect(explanation?.textContent).toBe("当前模型不支持生成音频");

    fireEvent.click(audio);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("keeps audio editable while selected model capabilities are not confirmed", () => {
    const capabilities = createSafeDefaultVideoCapabilities();
    capabilities.supportsAudio = false;
    const onChange = vi.fn();

    render(
      <VideoParameterPanel
        capabilities={capabilities}
        onChange={onChange}
        value={createDefaultVideoGenerationParams()}
      />,
    );

    const audio = screen.getByRole("switch", { name: "生成音频" });
    expect(audio.getAttribute("disabled")).toBeNull();
    fireEvent.click(audio);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ generateAudio: true }));
  });

  test("keeps the safe 2-8 second duration range editable before a route confirms capabilities", () => {
    render(
      <VideoParameterPanel
        onChange={vi.fn()}
        value={createDefaultVideoGenerationParams()}
      />,
    );

    const slider = screen.getByLabelText("时长滑杆");
    expect(slider.getAttribute("min")).toBe("2");
    expect(slider.getAttribute("max")).toBe("8");
    expect((slider as HTMLInputElement).disabled).toBe(false);
  });
});
