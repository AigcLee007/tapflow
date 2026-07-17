import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createSafeDefaultVideoCapabilities } from "./videoGenerationCapabilities";
import { createDefaultVideoGenerationParams } from "./videoGenerationParams";
import { VideoParameterPanel } from "./VideoParameterPanel";

describe("VideoParameterPanel", () => {
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
    expect(screen.getByRole("radiogroup", { name: "画面比例" })).toBeTruthy();
    expect(screen.getAllByRole("radio", { name: "自动" })).toHaveLength(1);
    for (const ratio of ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]) {
      expect(screen.getAllByRole("radio", { name: ratio })).toHaveLength(1);
    }
    for (const resolution of ["480P", "720P", "1080P", "4K"]) {
      expect(screen.getAllByRole("radio", { name: resolution })).toHaveLength(1);
    }
    expect(screen.getAllByRole("radio", { name: "开启" })).toHaveLength(1);
    expect(screen.getAllByRole("radio", { name: "关闭" })).toHaveLength(1);
    for (const count of ["1 个", "2 个", "4 个"]) {
      expect(screen.getAllByRole("radio", { name: count })).toHaveLength(1);
    }
  });

  test("keeps unsupported resolution and count visible but disabled with a Chinese reason", () => {
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

    const unsupported4K = screen.getByRole("radio", { name: /^4K/ });
    expect(unsupported4K.getAttribute("aria-disabled")).toBe("true");
    fireEvent.mouseEnter(unsupported4K);
    expect(screen.getByRole("note").textContent).toContain("当前模型不支持");
    fireEvent.click(unsupported4K);

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
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ count: 2 }));
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
  test("shows the effective duration range and announces only corrected durations", () => {
    const onChange = vi.fn();
    const capabilities = createSafeDefaultVideoCapabilities();
    capabilities.confirmedByRoute = true;
    capabilities.minDurationSeconds = 3;
    capabilities.maxDurationSeconds = 7;
    capabilities.durationStepSeconds = 2;

    render(<VideoParameterPanel capabilities={capabilities} onChange={onChange} value={createDefaultVideoGenerationParams()} />);

    expect(screen.getByText("最短 3 秒")).toBeTruthy();
    expect(screen.getByText("最长 7 秒")).toBeTruthy();

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
