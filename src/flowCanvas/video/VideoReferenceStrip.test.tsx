import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createDefaultVideoGenerationParams } from "./videoGenerationParams";
import { mergeVideoCapabilities } from "./videoGenerationCapabilities";
import { VideoReferenceStrip } from "./VideoReferenceStrip";

const pickerProps = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));

vi.mock("../nodes/ReferenceSourcePicker", () => ({
  ReferenceSourcePicker: (props: Record<string, unknown>) => {
    pickerProps.current = props;
    return props.open ? (
      <button type="button" onClick={() => (props.onPickAsset as (assetId: string) => void)("asset-picked")}>
        Pick an asset
      </button>
    ) : null;
  },
}));

function createValue() {
  return {
    referenceAssetItemIds: ["asset-existing"],
    referenceOrder: ["asset:asset-existing"],
    videoGeneration: {
      ...createDefaultVideoGenerationParams(),
      mode: "first_last_frame" as const,
    },
  };
}

describe("VideoReferenceStrip", () => {
  test("uses shared compact capsule geometry for reference slots", () => {
    const capabilities = mergeVideoCapabilities({
      confirmedByRoute: true,
      maxAudios: 1,
      maxImages: 5,
      maxTotal: 6,
      maxVideos: 1,
      modeConstraints: { all_reference: { maxAudios: 1, maxImages: 5, maxTotal: 6, maxVideos: 1 } },
      supportedModes: ["all_reference"],
    });
    render(
      <VideoReferenceStrip
        capabilities={capabilities}
        currentNodeId="video-node"
        onChange={vi.fn()}
        onConnectCanvasReference={vi.fn()}
        onUploadReference={vi.fn()}
        value={{ ...createDefaultVideoGenerationParams(), mode: "all_reference" }}
      />,
    );

    const imageSlot = screen.getByRole("button", { name: "添加参考图" });
    expect(imageSlot.className).toContain("bg-white/[0.06]");
    expect(imageSlot.style.height).toBe("28px");
    expect(imageSlot.style.borderRadius).toBe("9999px");
    expect(screen.getByRole("button", { name: "添加参考视频" }).style.height).toBe("28px");
    expect(screen.getByRole("button", { name: "添加参考音频" }).style.height).toBe("28px");
  });

  test("closes its picker and blocks reference mutations when disabled", () => {
    const onChange = vi.fn();
    const capabilities = mergeVideoCapabilities({ confirmedByRoute: true, maxImages: 1, maxTotal: 1, modeConstraints: { image_to_video: { maxImages: 1, maxTotal: 1 } }, supportedModes: ["image_to_video"] });
    const value = { ...createDefaultVideoGenerationParams(), mode: "image_to_video" as const };
    const { rerender } = render(<VideoReferenceStrip capabilities={capabilities} currentNodeId="video-node" onChange={onChange} onConnectCanvasReference={vi.fn()} onUploadReference={vi.fn()} value={value} />);
    fireEvent.click(screen.getByRole("button", { name: "添加参考图" }));
    expect(screen.getByRole("button", { name: "Pick an asset" })).toBeTruthy();
    rerender(<VideoReferenceStrip capabilities={capabilities} currentNodeId="video-node" disabled onChange={onChange} onConnectCanvasReference={vi.fn()} onUploadReference={vi.fn()} value={value} />);
    expect(screen.queryByRole("button", { name: "Pick an asset" })).toBeNull();
    expect((screen.getByRole("button", { name: "添加参考图" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
  test("renders Gemini all-reference inputs without an audio slot", () => {
    const capabilities = mergeVideoCapabilities({
      confirmedByRoute: true,
      maxAudios: 0,
      maxImages: 5,
      maxTotal: 6,
      maxVideos: 1,
      modeConstraints: { all_reference: { maxAudios: 0, maxImages: 5, maxTotal: 6, maxVideos: 1, minVideos: 1 } },
      referenceSemantics: "style_images_and_source_video",
      supportedModes: ["text_to_video", "image_to_video", "image_reference", "all_reference"],
    });
    render(
      <VideoReferenceStrip
        capabilities={capabilities}
        currentNodeId="video-node"
        onChange={vi.fn()}
        onConnectCanvasReference={vi.fn()}
        onUploadReference={vi.fn()}
        value={{ ...createDefaultVideoGenerationParams(), mode: "all_reference" }}
      />,
    );

    expect(screen.getByRole("button", { name: "添加参考图" }).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "添加源视频" }).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "添加参考音频" })).toBeNull();
  });

  test("persists only the uploaded asset identity and media kind", async () => {
    const onChange = vi.fn();
    const capabilities = mergeVideoCapabilities({
      confirmedByRoute: true,
      maxAudios: 1,
      maxTotal: 1,
      modeConstraints: { all_reference: { maxAudios: 1, maxTotal: 1 } },
      supportedModes: ["text_to_video", "all_reference"],
    });
    const { container } = render(
      <VideoReferenceStrip
        capabilities={capabilities}
        currentNodeId="video-node"
        onChange={onChange}
        onConnectCanvasReference={vi.fn()}
        onUploadReference={vi.fn(async () => ({ id: "asset-audio", kind: "audio" }))}
        value={{ ...createDefaultVideoGenerationParams(), mode: "all_reference" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "添加参考音频" }));
    const input = container.querySelector('input[type="file"]')!;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["audio"], "reference.mp3", { type: "audio/mpeg" })] } });
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      referenceInputs: [expect.objectContaining({ mediaKind: "audio", source: { kind: "asset", id: "asset-audio" } })],
    }));
  });

  test("downgrades Veo first-last frames to a single first frame after the first frame is removed", () => {
    const onChange = vi.fn();
    const capabilities = mergeVideoCapabilities({
      confirmedByRoute: true,
      maxImages: 2,
      maxTotal: 2,
      modeConstraints: {
        first_last_frame: { maxImages: 2, maxTotal: 2, minImages: 2 },
        image_to_video: { maxImages: 1, maxTotal: 1, minImages: 1 },
      },
      referenceSemantics: "ordered_first_last_frames",
      supportedModes: ["text_to_video", "image_to_video", "first_last_frame"],
    });
    const value = {
      ...createDefaultVideoGenerationParams(),
      mode: "first_last_frame" as const,
      referenceInputs: [
        { mediaKind: "image" as const, order: 0, referenceKey: "asset:first", role: "first_frame" as const, source: { kind: "asset" as const, id: "first" } },
        { mediaKind: "image" as const, order: 1, referenceKey: "asset:last", role: "last_frame" as const, source: { kind: "asset" as const, id: "last" } },
      ],
    };

    render(
      <VideoReferenceStrip
        capabilities={capabilities}
        currentNodeId="video-node"
        onChange={onChange}
        onConnectCanvasReference={vi.fn()}
        onUploadReference={vi.fn()}
        value={value}
      />,
    );

    fireEvent.click(screen.getAllByRole("button")[0]!);

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: "image_to_video",
      referenceInputs: [expect.objectContaining({ order: 0, role: "first_frame", source: { kind: "asset", id: "last" } })],
    }));
  });

  test("maps a selected role without changing existing asset order", () => {
    const onChange = vi.fn();
    const value = createValue();
    render(
      <VideoReferenceStrip currentNodeId="video-node" onChange={onChange} onUploadReference={vi.fn()} value={value} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "选择参考素材首帧" }));
    expect(pickerProps.current?.roleLabel).toBe("首帧");
    fireEvent.click(screen.getByRole("button", { name: "Pick an asset" }));

    expect(onChange).toHaveBeenCalledWith({
      referenceAssetItemIds: ["asset-existing", "asset-picked"],
      referenceOrder: ["asset:asset-existing", "asset:asset-picked"],
      videoGeneration: expect.objectContaining({
        referenceRolesByKey: {
          first_frame: {
            role: "first_frame",
            source: { kind: "asset", id: "asset-picked" },
          },
        },
      }),
    });
  });

  test("keeps asset and reference order unchanged when assigning an already ordered asset", () => {
    const onChange = vi.fn();
    const value = createValue();
    render(
      <VideoReferenceStrip currentNodeId="video-node" onChange={onChange} onUploadReference={vi.fn()} value={value} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "选择参考素材首帧" }));
    act(() => {
      (pickerProps.current?.onPickAsset as (assetId: string) => void)("asset-existing");
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      referenceAssetItemIds: value.referenceAssetItemIds,
      referenceOrder: value.referenceOrder,
    }));
  });

  test("clearing a role writes null without removing the persisted asset", () => {
    const onChange = vi.fn();
    const value = createValue();
    value.videoGeneration.referenceRolesByKey = {
      first_frame: { role: "first_frame", source: { kind: "asset", id: "asset-existing" } },
    };
    render(
      <VideoReferenceStrip currentNodeId="video-node" onChange={onChange} onUploadReference={vi.fn()} value={value} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "清除参考素材首帧" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      referenceAssetItemIds: ["asset-existing"],
      referenceOrder: ["asset:asset-existing"],
      videoGeneration: expect.objectContaining({
        referenceRolesByKey: { first_frame: null },
      }),
    }));
  });

  test("replacing a role removes only that role's stale context palette references", () => {
    const onChange = vi.fn();
    const value = createValue();
    value.videoGeneration = {
      ...value.videoGeneration,
      mode: "all_reference",
      referenceRolesByKey: {
        subject: { role: "subject", source: { kind: "asset", id: "asset-a" } },
        scene: { role: "scene", source: { kind: "asset", id: "asset-scene" } },
      },
      contextPaletteRefs: [
        { role: "subject", source: { kind: "asset", id: "asset-a" }, colorToken: "洋红" },
        { role: "scene", source: { kind: "asset", id: "asset-scene" }, colorToken: "湖蓝" },
      ],
    };
    render(
      <VideoReferenceStrip currentNodeId="video-node" onChange={onChange} onUploadReference={vi.fn()} value={value} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "选择参考素材人物" }));
    act(() => {
      (pickerProps.current?.onPickAsset as (assetId: string) => void)("asset-b");
    });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      videoGeneration: expect.objectContaining({
        contextPaletteRefs: [{ role: "scene", source: { kind: "asset", id: "asset-scene" }, colorToken: "湖蓝" }],
      }),
    }));
  });

  test("clearing a role removes all of that role's context palette references", () => {
    const onChange = vi.fn();
    const value = createValue();
    value.videoGeneration = {
      ...value.videoGeneration,
      mode: "all_reference",
      referenceRolesByKey: {
        subject: { role: "subject", source: { kind: "asset", id: "asset-a" } },
        scene: { role: "scene", source: { kind: "asset", id: "asset-scene" } },
      },
      contextPaletteRefs: [
        { role: "subject", source: { kind: "asset", id: "asset-a" }, colorToken: "洋红" },
        { role: "subject", source: { kind: "asset", id: "asset-old" }, colorToken: "湖蓝" },
        { role: "scene", source: { kind: "asset", id: "asset-scene" }, colorToken: "湖蓝" },
      ],
    };
    render(
      <VideoReferenceStrip currentNodeId="video-node" onChange={onChange} onUploadReference={vi.fn()} value={value} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "清除参考素材人物" }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      videoGeneration: expect.objectContaining({
        contextPaletteRefs: [{ role: "scene", source: { kind: "asset", id: "asset-scene" }, colorToken: "湖蓝" }],
      }),
    }));
  });

  test("closes an invalidated role picker and ignores its stale selection callback after a mode change", () => {
    const onChange = vi.fn();
    const value = createValue();
    const { rerender } = render(
      <VideoReferenceStrip currentNodeId="video-node" onChange={onChange} onUploadReference={vi.fn()} value={value} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "选择参考素材首帧" }));
    const stalePickAsset = pickerProps.current?.onPickAsset as (assetId: string) => void;

    rerender(
      <VideoReferenceStrip
        currentNodeId="video-node"
        onChange={onChange}
        onUploadReference={vi.fn()}
        value={{
          ...value,
          videoGeneration: {
            ...value.videoGeneration,
            mode: "image_to_video",
          },
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Pick an asset" })).toBeNull();
    act(() => stalePickAsset("asset-invalid"));

    expect(onChange).not.toHaveBeenCalled();
  });

  test("keeps an active picker when its role remains available after a mode change", () => {
    const onChange = vi.fn();
    const defaultVideoGeneration = createDefaultVideoGenerationParams();
    const value = {
      ...createValue(),
      videoGeneration: {
        ...defaultVideoGeneration,
        mode: "all_reference" as const,
      },
    };
    const { rerender } = render(
      <VideoReferenceStrip currentNodeId="video-node" onChange={onChange} onUploadReference={vi.fn()} value={value} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "选择参考素材人物" }));
    rerender(
      <VideoReferenceStrip
        currentNodeId="video-node"
        onChange={onChange}
        onUploadReference={vi.fn()}
        value={{
          ...value,
          videoGeneration: {
            ...value.videoGeneration,
            mode: "image_reference",
          },
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Pick an asset" })).not.toBeNull();
    act(() => {
      (pickerProps.current?.onPickAsset as (assetId: string) => void)("asset-subject");
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      videoGeneration: expect.objectContaining({
        referenceRolesByKey: {
          subject: {
            role: "subject",
            source: { kind: "asset", id: "asset-subject" },
          },
        },
      }),
    }));
  });
});
