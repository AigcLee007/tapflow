import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createDefaultVideoGenerationParams } from "./videoGenerationParams";
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
  test("maps a selected role without changing existing asset order", () => {
    const onChange = vi.fn();
    const value = createValue();
    render(
      <VideoReferenceStrip currentNodeId="video-node" onChange={onChange} onUploadReference={vi.fn()} value={value} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select first frame reference" }));
    expect(pickerProps.current?.roleLabel).toBe("First frame");
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

    fireEvent.click(screen.getByRole("button", { name: "Select first frame reference" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Clear first frame reference" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      referenceAssetItemIds: ["asset-existing"],
      referenceOrder: ["asset:asset-existing"],
      videoGeneration: expect.objectContaining({
        referenceRolesByKey: { first_frame: null },
      }),
    }));
  });
});
