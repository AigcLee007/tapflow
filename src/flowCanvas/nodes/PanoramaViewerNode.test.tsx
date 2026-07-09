import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PanoramaViewerNode } from "./PanoramaViewerNode";

const mockedStoreState = {
  edges: [],
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
    title: "360 Panorama Viewer",
    width: 900,
  };

  it("renders FOV presets and sphere-correction controls for a panorama source", () => {
    render(
      <PanoramaViewerNode
        data={viewerData as any}
        id="viewer-1"
        selected
      />,
    );

    expect(screen.getAllByText(/^FOV$/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^20$/i })).toBeTruthy();
    expect(screen.getByText(/correction/i)).toBeTruthy();
    expect(screen.getByText(/^Front direction$/i)).toBeTruthy();
  });

  it("collapses and re-expands the right control panel", () => {
    render(
      <PanoramaViewerNode
        data={viewerData as any}
        id="viewer-1"
        selected
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /collapse control panel/i }));
    expect(screen.queryByText(/correction/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /expand control panel/i }));
    expect(screen.getByText(/correction/i)).toBeTruthy();
  });
});
