import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createDefaultVideoGenerationParams } from "./videoGenerationParams";
import { VideoNodeComposer } from "./VideoNodeComposer";
import { VideoNodeLegacyComposer } from "./VideoNodeLegacyComposer";
import { mergeVideoCapabilities } from "./videoGenerationCapabilities";
import type { VideoModelOption } from "./videoTypes";

vi.mock("./useVideoGenerationCatalog", () => ({
  useVideoGenerationCatalog: () => ({ error: null, loading: true, models: [], retry: vi.fn() }),
}));

vi.mock("../nodes/ReferenceSourcePicker", () => ({
  ReferenceSourcePicker: () => null,
}));

describe("VideoNodeComposer", () => {
  test("shows the stable Chinese camera label in its trigger", () => {
    const data = {
      generationPrompt: "",
      params: { videoGeneration: { ...createDefaultVideoGenerationParams(), cameraMotionId: "dolly-in" } },
    } as any;

    render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

    expect(screen.getByRole("button", { name: "\u8fd0\u955c\u5e93" }).textContent).toContain("\u63a8\u8fdb");
    expect(document.body.textContent).not.toContain("Dolly in");
  });

  test("only renders controls while the node is selected", () => {
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    const { rerender } = render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected={false} />);
    expect(screen.queryByLabelText("视频提示词")).toBeNull();

    rerender(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);
    expect(screen.getByLabelText("视频提示词")).toBeTruthy();
  });

  test("uses a safe in-memory asset preview for the active palette role without exposing its raw id", () => {
    const data = {
      generationPrompt: "",
      params: {
        videoGeneration: {
          ...createDefaultVideoGenerationParams(),
          mode: "all_reference",
          referenceRolesByKey: {
            subject: { role: "subject", source: { kind: "asset", id: "asset-subject-123" } },
          },
        },
      },
    } as any;

    render(
      <VideoNodeComposer
        data={data}
        generating={false}
        nodeId="video-1"
        onGenerate={vi.fn()}
        onUpdate={vi.fn()}
        referencePreviewUrlsBySource={{ "asset:asset-subject-123": "/assets/subject.webp" }}
        selected
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调色盘" }));
    expect(screen.getByRole("img", { name: "人物参考" }).getAttribute("src")).toBe("/assets/subject.webp");
    expect(document.body.textContent).not.toContain("asset-subject-123");
  });

  test("renders creator-facing composer metadata in Chinese", () => {
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    const { container } = render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

    for (const label of ["Camera motion library", "Video prompt", "Choose video model", "Video parameters", "Generate video"]) {
      expect(container.textContent).not.toContain(label);
      expect(container.querySelector(`[aria-label=\"${label}\"]`)).toBeNull();
    }
    expect(screen.getByRole("button", { name: "运镜库" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "选择视频模型" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "视频参数" })).toBeNull();
    expect(screen.getByRole("button", { name: "视频参数摘要" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "生成视频" })).toBeTruthy();
  });

  test("writes the prompt and keeps model and parameters layers mutually exclusive", () => {
    const onUpdate = vi.fn();
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={onUpdate} selected />);

    fireEvent.change(screen.getByLabelText("视频提示词"), { target: { value: "A quiet city" } });
    expect(onUpdate).toHaveBeenCalledWith({ generationPrompt: "A quiet city" });

    fireEvent.click(screen.getByRole("button", { name: "选择视频模型" }));
    expect(screen.getByRole("status", { name: "正在加载视频模型" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "视频参数摘要" }));
    expect(screen.queryByRole("status", { name: "正在加载视频模型" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "视频参数" })).toBeTruthy();
  });

  test("places the video mode trigger in the bottom creation toolbar", () => {
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

    const modeTrigger = screen.getByRole("button", { name: "生成模式" });
    expect(modeTrigger.parentElement?.parentElement?.className).toContain("border-t");
  });

  test("renders the parameter panel as a fixed high-layer body portal", () => {
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

    fireEvent.click(screen.getByRole("button", { name: "视频参数摘要" }));
    const dialog = screen.getByRole("dialog", { name: "视频参数" });

    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.style.position).toBe("fixed");
    expect(dialog.style.zIndex).toBe("10020");
  });

  test("keeps the inline parameter summary synchronized with the current video params", () => {
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    const { rerender } = render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

    const summary = screen.getByRole("button", { name: "视频参数摘要" });
    expect(summary.textContent).toContain("自动 · 720P · 4 秒 · 1 个");
    expect(summary.textContent).not.toContain("音频关闭");
    expect(summary.querySelector(".lucide-volume-x")).toBeTruthy();
    expect(summary.parentElement?.parentElement?.className).toContain("flex");
    expect(screen.queryByRole("button", { name: "视频参数" })).toBeNull();

    const updatedData = {
      ...data,
      params: {
        videoGeneration: {
          ...data.params.videoGeneration,
          aspectRatio: "16:9",
          count: 2,
          durationSeconds: 9,
          generateAudio: true,
          resolution: "1080P",
        },
      },
    };
    rerender(<VideoNodeComposer data={updatedData} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

    const updatedSummary = screen.getByRole("button", { name: "视频参数摘要" });
    expect(updatedSummary.textContent).toContain("16:9 · 1080P · 9 秒 · 2 个");
    expect(updatedSummary.textContent).not.toContain("音频开启");
    expect(updatedSummary.querySelector(".lucide-volume-2")).toBeTruthy();
  });

  test("opens the parameter popover from the inline summary capsule", () => {
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

    fireEvent.click(screen.getByRole("button", { name: "视频参数摘要" }));

    expect(screen.getByRole("dialog", { name: "视频参数" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "视频参数" })).toBeNull();
  });

  test("dismisses compact layers with Escape and restores focus to their trigger", () => {
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

    const modelButton = screen.getByRole("button", { name: "选择视频模型" });
    fireEvent.click(modelButton);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("status", { name: "正在加载视频模型" })).toBeNull();
    expect(document.activeElement).toBe(modelButton);

    const parameterSummary = screen.getByRole("button", { name: "视频参数摘要" });
    fireEvent.click(parameterSummary);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "视频参数" })).toBeNull();
    expect(document.activeElement).toBe(parameterSummary);

    fireEvent.click(parameterSummary);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "视频参数" })).toBeNull();
    expect(document.activeElement).toBe(parameterSummary);
  });

  test("stacks the V2 composer controls at narrow layouts without changing the node itself", () => {
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

    expect(screen.getByLabelText("视频创作面板").className).toContain("w-[calc(100vw-32px)]");
    expect(screen.getByLabelText("视频创作面板").className).toContain("max-w-[980px]");
    expect(screen.getByLabelText("视频创作面板").className).toContain("md:w-[clamp(640px,52vw,980px)]");
    expect(screen.getByLabelText("视频创作面板").className).toContain("max-md:flex-col");
    expect(screen.getByLabelText("视频创作面板").className).toContain("max-md:left-0");
    expect(screen.getByRole("button", { name: "选择视频模型" }).parentElement?.parentElement?.className).toContain("max-md:flex-col");
  });

  test("reconciles duration and other params when switching to a narrower model", () => {
    const onUpdate = vi.fn();
    const broadModel: VideoModelOption = {
      blocker: null,
      capabilities: mergeVideoCapabilities({ confirmedByRoute: true, maxDurationSeconds: 8 }),
      description: "Broad model",
      estimatedCredits: 1,
      estimatedDurationLabel: "Up to 8 seconds",
      id: "broad-model",
      label: "Broad model",
      minChargeCredits: 1,
    };
    const narrowModel: VideoModelOption = {
      blocker: null,
      capabilities: mergeVideoCapabilities({
        confirmedByRoute: true,
        durationStepSeconds: 2,
        maxDurationSeconds: 4,
        minDurationSeconds: 2,
        supportsAudio: false,
      }),
      description: "Narrow model",
      estimatedCredits: 1,
      estimatedDurationLabel: "Up to 4 seconds",
      id: "narrow-model",
      label: "Narrow model",
      minChargeCredits: 1,
    };
    const catalog = { error: null, loading: false, models: [broadModel, narrowModel], retry: vi.fn() };
    const data = {
      generationPrompt: "",
      modelId: broadModel.id,
      params: {
        videoGeneration: {
          ...createDefaultVideoGenerationParams(),
          durationSeconds: 8,
          generateAudio: true,
        },
      },
    } as any;

    render(<VideoNodeComposer catalog={catalog} data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={onUpdate} selected />);
    fireEvent.click(screen.getByRole("button", { name: "选择视频模型" }));
    fireEvent.click(screen.getByRole("option", { name: /Narrow model/ }));

    expect(onUpdate).toHaveBeenCalledWith({
      modelId: narrowModel.id,
      params: {
        videoGeneration: expect.objectContaining({ durationSeconds: 4, generateAudio: false }),
      },
    });
  });

  test("patches an existing invalid draft once when its confirmed route loads", () => {
    const onUpdate = vi.fn();
    const model: VideoModelOption = {
      blocker: null,
      capabilities: mergeVideoCapabilities({ confirmedByRoute: true, maxDurationSeconds: 4 }),
      description: "Narrow model",
      estimatedCredits: 1,
      id: "narrow-model",
      label: "Narrow model",
      minChargeCredits: 1,
    };
    const catalog = { error: null, loading: false, models: [model], retry: vi.fn() };
    const data = {
      generationPrompt: "",
      modelId: model.id,
      params: { videoGeneration: { ...createDefaultVideoGenerationParams(), durationSeconds: 8 } },
    } as any;
    const { rerender } = render(<VideoNodeComposer catalog={catalog} data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={onUpdate} selected />);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const correctedData = {
      ...data,
      params: {
        ...data.params,
        videoGeneration: { ...data.params.videoGeneration, durationSeconds: 4 },
      },
    };
    rerender(<VideoNodeComposer catalog={catalog} data={correctedData} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={onUpdate} selected />);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  test("retains the rollback composer model, aspect, duration, HD, count, and generation controls", () => {
    const data = { generationPrompt: "", modelId: "veo3.1-fast", params: { aspect_ratio: "16:9", duration: "4" } } as any;
    render(<VideoNodeLegacyComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} />);

    expect(screen.getByRole("button", { name: /视频模型 video-1/i })).toBeTruthy();
    expect(screen.getByText("1080P")).toBeTruthy();
    expect(screen.getByText("高清")).toBeTruthy();
    expect(screen.getByRole("button", { name: "生成视频 video-1" })).toBeTruthy();
  });

  test("resizes an ungenerated legacy video node when its aspect ratio changes", () => {
    const onUpdate = vi.fn();
    const data = { generationPrompt: "", modelId: "veo3.1-fast", params: { aspect_ratio: "16:9", duration: "4" } } as any;
    render(<VideoNodeLegacyComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "视频比例 video-1 16:9" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "9:16" }));

    expect(onUpdate).toHaveBeenCalledWith({
      params: { aspect_ratio: "9:16", duration: "4" },
      width: 170,
      height: 302,
      aspectRatio: 9 / 16,
    });
  });

  test("does not resize a legacy node when a runtime video result supplies its poster", () => {
    const onUpdate = vi.fn();
    const data = { generationPrompt: "", modelId: "veo3.1-fast", params: { aspect_ratio: "16:9", duration: "4" } } as any;
    render(
      <VideoNodeLegacyComposer
        data={data}
        generating={false}
        nodeId="video-1"
        onGenerate={vi.fn()}
        onUpdate={onUpdate}
        runtimeVideoAssets={[{ downloadUrl: "https://cdn.test/runtime-output.mp4" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "视频比例 video-1 16:9" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "9:16" }));

    expect(onUpdate).toHaveBeenCalledWith({
      params: { aspect_ratio: "9:16", duration: "4" },
    });
  });
});
