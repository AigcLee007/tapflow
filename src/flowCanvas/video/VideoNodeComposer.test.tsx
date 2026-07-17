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

describe("VideoNodeComposer", () => {
  test("only renders controls while the node is selected", () => {
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    const { rerender } = render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected={false} />);
    expect(screen.queryByLabelText("视频提示词")).toBeNull();

    rerender(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);
    expect(screen.getByLabelText("视频提示词")).toBeTruthy();
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
    expect(screen.getByRole("button", { name: "视频参数" })).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "视频参数" }));
    expect(screen.queryByRole("status", { name: "正在加载视频模型" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "视频参数" })).toBeTruthy();
  });

  test("dismisses compact layers with Escape and restores focus to their trigger", () => {
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

    const modelButton = screen.getByRole("button", { name: "选择视频模型" });
    fireEvent.click(modelButton);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("status", { name: "正在加载视频模型" })).toBeNull();
    expect(document.activeElement).toBe(modelButton);

    const parameterButton = screen.getByRole("button", { name: "视频参数" });
    fireEvent.click(parameterButton);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "视频参数" })).toBeNull();
    expect(document.activeElement).toBe(parameterButton);
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
