import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiFlowCanvas } from "../canvas/AiFlowCanvas";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    Background: () => null,
    BackgroundVariant: { Dots: "dots" },
    MiniMap: () => null,
    ReactFlow: ({ children, onPaneClick, onPaneContextMenu, ...props }: any) => (
      <div
        data-testid="react-flow"
        onClick={onPaneClick}
        onContextMenu={onPaneContextMenu}
        {...props}
      >
        {children}
      </div>
    ),
    SelectionMode: { Partial: "partial" },
    useReactFlow: () => ({
      fitView: vi.fn(),
      flowToScreenPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
      getNode: () => null,
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
      setCenter: vi.fn(),
      setViewport: vi.fn(async () => undefined),
      zoomTo: vi.fn(async () => undefined),
    }),
  };
});

vi.mock("../nodes/FlowNodes", async () => {
  const React = await import("react");
  const Stub = ({ data }: any) => React.createElement("div", null, data?.title ?? "node");
  return {
    AudioNodeComponent: Stub,
    GroupNodeComponent: Stub,
    ImageEditorNodeComponent: Stub,
    ImageNodeComponent: Stub,
    TextNodeComponent: Stub,
    UploadNodeComponent: Stub,
    VideoNodeComponent: Stub,
  };
});

vi.mock("../edges/SmartEdge", () => ({
  SmartEdgeComponent: () => null,
}));

vi.mock("../panels", async () => {
  const React = await import("react");
  return {
    CanvasAssetPanel: () => null,
    CanvasCommentPanel: () => null,
    CanvasDockDrawer: ({ children }: any) => <div>{children}</div>,
    CanvasDockEmptyState: () => null,
    CanvasHistoryPanel: () => null,
    CanvasTemplatePanel: () => null,
  };
});

vi.mock("../canvas/ConnectionMenu", () => ({
  ConnectionMenu: () => null,
}));

vi.mock("../canvas/FlowContextMenu", () => ({
  FlowContextMenu: () => null,
}));

vi.mock("../canvas/FlowLeftAddPanel", () => ({
  FlowLeftAddPanel: () => null,
}));

vi.mock("../../assets/assetApi", () => ({
  getAsset: vi.fn(),
  getAssetVariantUrl: vi.fn(),
  listAssets: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock("../../services/v2FlowTemplatesApi", () => ({
  getFlowTemplate: vi.fn(),
  recordFlowTemplateUsage: vi.fn(async () => undefined),
}));

vi.mock("../../services/v2FlowHistoryApi", () => ({
  listProjectHistory: vi.fn(async () => ({ items: [] })),
}));

vi.mock("../../services/v2FlowCommentsApi", () => ({
  listFlowComments: vi.fn(async () => ({ items: [] })),
}));

describe("Canvas agent integration", () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().newProject();
  });

  it("opens the canvas agent panel from the bottom-right agent button", async () => {
    render(<AiFlowCanvas cullingEnabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "打开 Agent" }));

    expect((await screen.findAllByText("TapFlow Agent")).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "对话" })).toBeTruthy();
  });
});
