import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImageNodeComponent } from "./FlowNodes";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

const assetApiMocks = vi.hoisted(() => ({
  getAsset: vi.fn(),
  getAssetDownloadUrl: vi.fn(),
  getAssetVariantUrl: vi.fn(),
  uploadAssetFile: vi.fn(),
}));

vi.mock("../../assets/assetApi", () => ({
  getAsset: (...args: unknown[]) => assetApiMocks.getAsset(...args),
  getAssetDownloadUrl: (...args: unknown[]) => assetApiMocks.getAssetDownloadUrl(...args),
  getAssetVariantUrl: (...args: unknown[]) => assetApiMocks.getAssetVariantUrl(...args),
  uploadAssetFile: (...args: unknown[]) => assetApiMocks.uploadAssetFile(...args),
}));
vi.mock("../runtime/v2WorkflowRunner", () => ({ markBackendRunLaunchFailed: vi.fn(), runBackendWorkflow: vi.fn() }));
vi.mock("../text/useTextGenerationCatalog", () => ({ useTextGenerationCatalog: () => ({ error: null, loading: false, models: [], retry: vi.fn() }) }));
vi.mock("../video/useVideoGenerationCatalog", () => ({ useVideoGenerationCatalog: () => ({ error: null, loading: false, models: [], retry: vi.fn() }) }));
vi.mock("../../auth/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    addEdge: (edge: Record<string, unknown>, edges: Record<string, unknown>[]) => [...edges, { id: String(edge.id || `edge-${edges.length}`), ...edge }],
    Handle: () => null,
    NodeResizer: () => null,
    Position: { Left: "left", Right: "right" },
    useConnection: () => ({ connectionNodeId: null }),
    useReactFlow: () => ({ flowToScreenPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }), getNode: () => null }),
    useViewport: () => ({ zoom: 1 }),
  };
});

function StoreBackedImageNode({ nodeId }: { nodeId: string }) {
  const node = useFlowCanvasStore((state) => state.nodes.find((item) => item.id === nodeId));
  return node ? <ImageNodeComponent id={node.id} selected data={node.data as any} dragging={false} zIndex={1} isConnectable type="image" xPos={0} yPos={0} /> : null;
}

function addImageTarget() {
  return useFlowCanvasStore.getState().addNode("image", { x: 480, y: 0 }, {
    createdAt: 1, generationPrompt: "local prompt", generationStatus: "idle", height: 220, kind: "image", status: "idle", title: "Image target", updatedAt: 1, width: 320,
  } as any, { selected: true });
}

describe("ImageNodeComponent unified inputs", () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().newProject();
    assetApiMocks.getAsset.mockReset();
    assetApiMocks.getAssetDownloadUrl.mockReset();
    assetApiMocks.getAssetVariantUrl.mockReset();
    assetApiMocks.uploadAssetFile.mockReset();
    assetApiMocks.getAsset.mockRejectedValue(new Error("offline"));
  });

  it("renders text and two image inputs while keeping prompt mentions image-only", async () => {
    const text = useFlowCanvasStore.getState().addNode("text", { x: 0, y: 0 }, { generationPrompt: "A mountain at sunrise", text: "A mountain at sunrise", title: "Scene brief" } as any);
    const image = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 180 }, { assetId: "asset-ready", thumbnailUrl: "https://cdn.test/ready.png", title: "Ready image" } as any);
    const previewless = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 360 }, { assetId: "asset-previewless", title: "Previewless image" } as any);
    const target = addImageTarget();
    useFlowCanvasStore.getState().onConnect({ source: text.id, target: target.id });
    useFlowCanvasStore.getState().onConnect({ source: image.id, target: target.id });
    useFlowCanvasStore.getState().onConnect({ source: previewless.id, target: target.id });
    assetApiMocks.getAsset.mockRejectedValue(new Error("offline"));

    render(<StoreBackedImageNode nodeId={target.id} />);

    const tray = await screen.findByLabelText("节点输入");
    expect(tray).toBeTruthy();
    expect(tray.querySelector('[aria-label^="输入 1：Scene brief"]')).toBeTruthy();
    expect(tray.querySelector('[aria-label^="输入 2：Ready image"]')).toBeTruthy();
    expect(tray.querySelector('[aria-label^="输入 3：Previewless image"]')).toBeTruthy();
    expect(screen.queryByText(/@Image 1/)).toBeNull();
  });

  it("removes only the selected text edge and focuses an upstream source on double click", async () => {
    const text = useFlowCanvasStore.getState().addNode("text", { x: 0, y: 0 }, { generationPrompt: "Connected text", title: "Text source" } as any);
    const image = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 180 }, { assetId: "asset-ready", thumbnailUrl: "https://cdn.test/ready.png", title: "Image source" } as any);
    const target = addImageTarget();
    useFlowCanvasStore.getState().onConnect({ source: text.id, target: target.id });
    useFlowCanvasStore.getState().onConnect({ source: image.id, target: target.id });
    render(<StoreBackedImageNode nodeId={target.id} />);

    const tray = await screen.findByLabelText("节点输入");
    const textCard = tray.querySelector('[aria-label^="输入 1：Text source"]') as HTMLElement;
    fireEvent.doubleClick(textCard);
    expect(useFlowCanvasStore.getState().nodes.find((node) => node.id === text.id)?.selected).toBe(true);

    fireEvent.click(screen.getByLabelText(new RegExp(`移除输入 1.*Text source`)));
    await waitFor(() => expect(useFlowCanvasStore.getState().edges).toEqual([
      expect.objectContaining({ source: image.id, target: target.id }),
    ]));
  });

  it("persists a unified input order and an image-only reference order after drag reorder", async () => {
    const text = useFlowCanvasStore.getState().addNode("text", { x: 0, y: 0 }, { generationPrompt: "Connected text", title: "Text source" } as any);
    const image = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 180 }, { assetId: "asset-ready", thumbnailUrl: "https://cdn.test/ready.png", title: "Image source" } as any);
    const target = addImageTarget();
    useFlowCanvasStore.getState().onConnect({ source: text.id, target: target.id });
    useFlowCanvasStore.getState().onConnect({ source: image.id, target: target.id });
    render(<StoreBackedImageNode nodeId={target.id} />);

    const tray = await screen.findByLabelText("节点输入");
    const textCard = tray.querySelector('[aria-label^="输入 1：Text source"]') as HTMLElement;
    const imageCard = tray.querySelector('[aria-label^="输入 2：Image source"]') as HTMLElement;
    fireEvent.dragStart(textCard, { dataTransfer: { effectAllowed: "move", setData: vi.fn() } });
    fireEvent.drop(imageCard, { dataTransfer: { effectAllowed: "move", setData: vi.fn() } });

    await waitFor(() => expect(useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)?.data).toMatchObject({
      inputOrder: [`upstream:${image.id}`, `upstream:${text.id}`],
      referenceOrder: [`upstream:${image.id}`],
    }));
  });
});
