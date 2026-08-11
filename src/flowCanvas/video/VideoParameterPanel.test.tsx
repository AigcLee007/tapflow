import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createSafeDefaultVideoCapabilities } from "./videoGenerationCapabilities";
import { createDefaultVideoGenerationParams } from "./videoGenerationParams";
import { VideoParameterPanel } from "./VideoParameterPanel";
import { mergeVideoCapabilities } from "./videoGenerationCapabilities";

describe("VideoParameterPanel", () => {
  test("renders Veo exact duration and fixed generated-audio controls", () => {
    const onChange = vi.fn();
    const capabilities = mergeVideoCapabilities({
      aspectRatios: ["16:9", "9:16"],
      audioControlMode: "always_on_implicit",
      confirmedByRoute: true,
      defaults: { durationSeconds: 4, resolution: "1080P" },
      resolutions: ["720P", "1080P"],
      supportedDurations: [4, 6, 8],
    });
    render(
      <VideoParameterPanel
        capabilities={capabilities}
        onChange={onChange}
        pricing={{ billingBasis: "duration_second", exact: true, minChargeCredits: 2, unit: "video_generation", unitCredits: 0.5 }}
        value={{ ...createDefaultVideoGenerationParams(), resolution: "1080P" }}
      />,
    );

    expect(screen.getAllByRole("button", { name: /秒/ }).map((button) => button.textContent)).toEqual(["4 秒", "6 秒", "8 秒"]);
    expect(screen.getByRole("button", { name: "生成音频：开启" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "8 秒" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 8, generateAudio: true, count: 1 }));
    expect(screen.getByText("预计 2 金币 · 0.5 金币/秒")).toBeTruthy();
  });
  test("uses Chinese visual ratio cards and segmented parameter controls instead of select menus", () => {
    render(
      <VideoParameterPanel
        capabilities={createSafeDefaultVideoCapabilities()}
        onChange={vi.fn()}
        value={createDefaultVideoGenerationParams()}
      />,
    );

    expect(document.querySelector("select")).toBeNull();
    expect(screen.queryByRole("menuitem")).toBeNull();
    const parameterContent = screen.getByLabelText("视频参数内容");
    expect(parameterContent.className).not.toContain("bg-[#242424]");
    expect(parameterContent.className).toContain("max-w-[350px]");
    expect(parameterContent.className).toContain("space-y-3");
    expect(screen.getByRole("radiogroup", { name: "画面比例" })).toBeTruthy();
    expect(screen.getAllByRole("radio", { name: "自动" })).toHaveLength(1);
    for (const ratio of ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]) {
      expect(screen.getAllByRole("radio", { name: ratio })).toHaveLength(1);
    }
    expect(screen.getByRole("radio", { name: "16:9" }).className).toContain("h-[70px]");
    for (const resolution of ["480P", "720P", "1080P", "2K", "4K"]) {
      expect(screen.getAllByRole("radio", { name: resolution })).toHaveLength(1);
    }
    expect(screen.getByRole("radio", { name: "720P" }).className).toContain("h-9");
    expect(screen.getAllByRole("radio", { name: "开启" })).toHaveLength(1);
    expect(screen.getAllByRole("radio", { name: "关闭" })).toHaveLength(1);
    for (const count of ["1 个", "2 个", "4 个"]) {
      expect(screen.getAllByRole("radio", { name: count })).toHaveLength(1);
    }
    const slider = screen.getByRole("slider", { name: "视频时长滑杆" });
    expect(slider.getAttribute("min")).toBe("4");
    expect(slider.getAttribute("max")).toBe("15");
    expect(slider.className).toContain("video-duration-range");
    expect(slider.style.getPropertyValue("--duration-progress")).toBe("0%");
    expect(screen.getByLabelText("视频时长控制").contains(slider)).toBe(true);
    expect(screen.queryByText(/^最短 /)).toBeNull();
    expect(screen.queryByText(/^最长 /)).toBeNull();
  });

  test("renders all resolutions but disables unsupported H3 choices", () => {
    const capabilities = mergeVideoCapabilities({
      confirmedByRoute: true,
      defaults: { durationSeconds: 15, resolution: "2K" },
      resolutions: ["2K"],
      supportedDurations: [15],
    });
    render(
      <VideoParameterPanel
        capabilities={capabilities}
        onChange={vi.fn()}
        value={{ ...createDefaultVideoGenerationParams(), resolution: "4K", durationSeconds: 15 }}
      />,
    );

    for (const resolution of ["480P", "720P", "1080P", "2K", "4K"]) {
      expect(screen.getByRole("radio", { name: new RegExp(`^${resolution}`) })).toBeTruthy();
    }
    expect(screen.getByRole("radio", { name: "2K" }).getAttribute("aria-disabled")).toBe("false");
    for (const resolution of ["480P", "720P", "1080P", "4K"]) {
      const option = screen.getByRole("radio", { name: new RegExp(`^${resolution}`) });
      expect(option.getAttribute("aria-disabled")).toBe("true");
      expect(option.getAttribute("title")).toContain(resolution);
    }
  });

  test("keeps all resolution choices visible while disabling unsupported route resolutions", () => {
    const capabilities = createSafeDefaultVideoCapabilities();
    capabilities.confirmedByRoute = true;
    capabilities.resolutions = ["720P"];
    capabilities.maxCount = 1;
    const onChange = vi.fn();

    render(
      <VideoParameterPanel
        capabilities={capabilities}
        onChange={onChange}
        value={createDefaultVideoGenerationParams()}
      />,
    );

    expect(screen.getByRole("radio", { name: "720P" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "720P" }).getAttribute("aria-disabled")).toBe("false");
    expect(screen.getByRole("radio", { name: /^4K/ }).getAttribute("aria-disabled")).toBe("true");

    const unsupportedCount = screen.getByRole("radio", { name: /^4 个/ });
    expect(unsupportedCount.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(unsupportedCount);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("uses audio and count segmentation without changing unrelated video generation data", () => {
    const onChange = vi.fn();
    const value = {
      ...createDefaultVideoGenerationParams(),
      cameraMotionId: "push-in",
      mode: "image_reference" as const,
      referenceRolesByKey: {
        asset: { role: "reference" as const, source: { id: "asset-1", kind: "asset" as const } },
      },
    };

    render(
      <VideoParameterPanel
        capabilities={createSafeDefaultVideoCapabilities()}
        onChange={onChange}
        value={value}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "关闭" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      cameraMotionId: "push-in",
      generateAudio: false,
      mode: "image_reference",
      referenceRolesByKey: value.referenceRolesByKey,
    }));

    fireEvent.click(screen.getByRole("radio", { name: "2 个" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ count: 1 }));
  });

  test("coerces duration to the selected model limits and step on blur and Enter", () => {
    const onChange = vi.fn();
    const capabilities = createSafeDefaultVideoCapabilities();
    capabilities.confirmedByRoute = true;
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

    const input = screen.getByLabelText("视频时长输入");
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ durationSeconds: 7 }));

    fireEvent.change(input, { target: { value: "4" } });
    onChange.mockClear();
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ durationSeconds: 5 }));
  });

  test("disables confirmed unsupported audio with a Chinese explanation but leaves unconfirmed capability editable", () => {
    const unsupported = createSafeDefaultVideoCapabilities();
    unsupported.confirmedByRoute = true;
    unsupported.supportsAudio = false;
    const onChange = vi.fn();
    const { rerender } = render(
      <VideoParameterPanel capabilities={unsupported} onChange={onChange} value={createDefaultVideoGenerationParams()} />,
    );

    const audioOn = screen.getByRole("radio", { name: /^开启/ });
    expect(audioOn.getAttribute("aria-disabled")).toBe("true");
    fireEvent.mouseEnter(audioOn);
    expect(screen.getByRole("note").textContent).toContain("当前模型不支持生成音频");
    fireEvent.click(audioOn);
    expect(onChange).not.toHaveBeenCalled();

    const unconfirmed = { ...unsupported, confirmedByRoute: false };
    rerender(<VideoParameterPanel capabilities={unconfirmed} onChange={onChange} value={createDefaultVideoGenerationParams()} />);
    expect(screen.getByRole("radio", { name: "开启" }).getAttribute("aria-disabled")).toBe("false");
    expect(screen.getByRole("radio", { name: "关闭" }).getAttribute("aria-disabled")).toBe("false");
  });
  test("uses the effective model duration range and announces only corrected durations", () => {
    const onChange = vi.fn();
    const capabilities = createSafeDefaultVideoCapabilities();
    capabilities.confirmedByRoute = true;
    capabilities.minDurationSeconds = 3;
    capabilities.maxDurationSeconds = 7;
    capabilities.durationStepSeconds = 2;

    render(<VideoParameterPanel capabilities={capabilities} onChange={onChange} value={createDefaultVideoGenerationParams()} />);

    const slider = screen.getByRole("slider", { name: "视频时长滑杆" });
    expect(slider.getAttribute("min")).toBe("3");
    expect(slider.getAttribute("max")).toBe("7");
    expect(slider.getAttribute("step")).toBe("2");
    expect(screen.queryByText(/^最短 /)).toBeNull();
    expect(screen.queryByText(/^最长 /)).toBeNull();

    const input = screen.getByLabelText("视频时长输入");
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);
    expect(screen.queryByText(/已按当前模型能力调整/)).toBeNull();

    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.blur(input);
    expect(screen.getByRole("status").textContent).toContain("已按当前模型能力调整为 7 秒");

    fireEvent.input(screen.getByRole("slider", { name: "视频时长滑杆" }), { target: { value: "6" } });
    expect(screen.getByRole("status").textContent).toContain("已按当前模型能力调整为 7 秒");

    fireEvent.change(input, { target: { value: "8" } });
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("status").textContent).toContain("已按当前模型能力调整为 7 秒");
  });

  test("disables both audio choices and exposes a Chinese help tooltip for confirmed unsupported audio", () => {
    const unsupported = createSafeDefaultVideoCapabilities();
    unsupported.confirmedByRoute = true;
    unsupported.supportsAudio = false;
    const onChange = vi.fn();

    render(<VideoParameterPanel capabilities={unsupported} onChange={onChange} value={createDefaultVideoGenerationParams()} />);

    const audioOn = screen.getByRole("radio", { name: /^开启/ });
    const audioOff = screen.getByRole("radio", { name: /^关闭/ });
    expect(audioOn.getAttribute("aria-disabled")).toBe("true");
    expect(audioOff.getAttribute("aria-disabled")).toBe("true");
    expect(audioOn.getAttribute("tabindex")).toBe("-1");
    expect(audioOff.getAttribute("tabindex")).toBe("-1");
    fireEvent.click(audioOff);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "音频支持说明" }));
    expect(screen.getByRole("tooltip").textContent).toBe("当前模型不支持生成音频");
  });
});
