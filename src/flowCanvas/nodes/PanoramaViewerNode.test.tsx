import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PanoramaViewerNode } from "./PanoramaViewerNode";

const mockedStoreState = {
  edges: [],
  updateNodeData: vi.fn(),
  nodes: [
    {
      data: {
        generationMode: "panorama_360",
        kind: "image",
        thumbnailUrl: "https://cdn.test/panorama.png",
        title: "Panorama Source",
      },
      id: "image-source-1",
      type: "image",
    },
  ],
};

vi.mock("../store/flowCanvasStore", () => ({
  useFlowCanvasStore: (selector: (state: typeof mockedStoreState) => unknown) => selector(mockedStoreState),
}));

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  return {
    ...actual,
    Handle: () => <div data-testid="flow-handle" />,
    NodeResizer: () => null,
    useConnection: () => ({ connectionNodeId: null }),
  };
});

describe("PanoramaViewerNode", () => {
  const viewerData = {
    fovDeg: 70,
    frontYawDeg: 0,
    height: 540,
    kind: "panorama_viewer",
    panelOpen: true,
    panoramaSourceNodeId: "image-source-1",
    sphereCorrectionDeg: { pitch: 0, roll: 0, yaw: 0 },
    title: "360 全景查看器",
    width: 900,
  };

  const updateNodeDataMock = mockedStoreState.updateNodeData;

  beforeEach(() => {
    updateNodeDataMock.mockReset();
  });

  it("renders Chinese labels for the panorama controls", () => {
    render(
      <PanoramaViewerNode
        data={viewerData as any}
        id="viewer-1"
        selected
      />,
    );

    expect(screen.queryByText(/FOV/i)).toBeNull();
    expect(screen.getAllByText("视角").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^20$/i })).toBeTruthy();
    expect(screen.getByText("球面校正")).toBeTruthy();
    expect(screen.getByRole("button", { name: "锁定当前视角" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "正前方" })).toBeTruthy();
  });

  it("collapses and re-expands the right control panel", () => {
    render(
      <PanoramaViewerNode
        data={viewerData as any}
        id="viewer-1"
        selected
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /收起控制面板/i }));
    expect(screen.queryByText("球面校正")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /展开控制面板/i }));
    expect(screen.getByText("球面校正")).toBeTruthy();
  });

  it("upgrades persisted viewer sizes that are too small for the panorama layout", async () => {
    render(
      <PanoramaViewerNode
        data={{ ...viewerData, height: 240, width: 360 } as any}
        id="viewer-1"
        selected
      />,
    );

    await waitFor(() => {
      expect(updateNodeDataMock).toHaveBeenCalledWith(
        "viewer-1",
        expect.objectContaining({
          height: 540,
          width: 900,
        }),
      );
    });
  });
});
