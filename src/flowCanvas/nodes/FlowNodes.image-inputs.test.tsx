import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Connection, Node, NodeProps } from "@xyflow/react";

import { ImageNodeComponent } from "./FlowNodes";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import type { FlowNodeData } from "../types";

const assetApiMocks = vi.hoisted(() => ({
  getAsset: vi.fn(),
  getAssetDownloadUrl: vi.fn(),
  getAssetVariantUrl: vi.fn(),
  deleteAsset: vi.fn(),
  uploadAssetFile: vi.fn(),
}));

vi.mock("../../assets/assetApi", () => ({
  getAsset: (...args: unknown[]) => assetApiMocks.getAsset(...args),
  getAssetDownloadUrl: (...args: unknown[]) => assetApiMocks.getAssetDownloadUrl(...args),
  getAssetVariantUrl: (...args: unknown[]) => assetApiMocks.getAssetVariantUrl(...args),
  deleteAsset: (...args: unknown[]) => assetApiMocks.deleteAsset(...args),
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
  const props: NodeProps<Node<FlowNodeData>> | null = node ? {
    data: node.data,
    deletable: true,
    draggable: true,
    dragging: false,
    id: node.id,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selectable: true,
    selected: true,
    type: "image",
    zIndex: 1,
  } : null;
  return props ? <ImageNodeComponent {...props} /> : null;
}

function connect(source: string, target: string) {
  useFlowCanvasStore.getState().onConnect({ source, sourceHandle: "out", target, targetHandle: "in" } satisfies Connection);
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
    assetApiMocks.deleteAsset.mockReset();
    assetApiMocks.uploadAssetFile.mockReset();
    assetApiMocks.getAsset.mockRejectedValue(new Error("offline"));
  });

  it("renders text and two image inputs while keeping prompt mentions image-only", async () => {
    const text = useFlowCanvasStore.getState().addNode("text", { x: 0, y: 0 }, { generationPrompt: "A mountain at sunrise", text: "A mountain at sunrise", title: "Scene brief" } as any);
    const image = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 180 }, { assetId: "asset-ready", thumbnailUrl: "https://cdn.test/ready.png", title: "Ready image" } as any);
    const previewless = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 360 }, { assetId: "asset-previewless", title: "Previewless image" } as any);
    const target = addImageTarget();
    connect(text.id, target.id);
    connect(image.id, target.id);
    connect(previewless.id, target.id);
    assetApiMocks.getAsset.mockRejectedValue(new Error("offline"));

    render(<StoreBackedImageNode nodeId={target.id} />);

    const tray = await screen.findByLabelText("节点输入");
    expect(tray).toBeTruthy();
    expect(screen.getByRole("button", { name: "文本输入，共 1 个节点" })).toBeTruthy();
    expect(tray.querySelector('[aria-label^="输入 1：Ready image"]')).toBeTruthy();
    expect(tray.querySelector('[aria-label^="输入 2：Previewless image"]')).toBeTruthy();
    expect(screen.queryByText(/@Image 1/)).toBeNull();
  });

  it("removes only the selected text edge and focuses an upstream source on click", async () => {
    const text = useFlowCanvasStore.getState().addNode("text", { x: 0, y: 0 }, { generationPrompt: "Connected text", title: "Text source" } as any);
    const image = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 180 }, { assetId: "asset-ready", thumbnailUrl: "https://cdn.test/ready.png", title: "Image source" } as any);
    const target = addImageTarget();
    connect(text.id, target.id);
    connect(image.id, target.id);
    render(<StoreBackedImageNode nodeId={target.id} />);

    const tray = await screen.findByLabelText("节点输入");
    const textGroup = screen.getByRole("button", { name: "文本输入，共 1 个节点" });
    fireEvent.mouseEnter(textGroup);
    fireEvent.click(screen.getByRole("menuitem", { name: "聚焦文本输入 Text source" }));
    expect(useFlowCanvasStore.getState().nodes.find((node) => node.id === text.id)?.selected).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "移除输入 Text source" }));
    await waitFor(() => expect(useFlowCanvasStore.getState().edges).toEqual([
      expect.objectContaining({ source: image.id, target: target.id }),
    ]));
  });

  it("removes every upstream text edge from the aggregate text input action", async () => {
    const firstText = useFlowCanvasStore.getState().addNode("text", { x: 0, y: 0 }, { generationPrompt: "One", title: "First text" } as any);
    const secondText = useFlowCanvasStore.getState().addNode("text", { x: 0, y: 80 }, { generationPrompt: "Two", title: "Second text" } as any);
    const image = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 180 }, { assetId: "asset-ready", thumbnailUrl: "https://cdn.test/ready.png", title: "Image source" } as any);
    const target = addImageTarget();
    connect(firstText.id, target.id);
    connect(secondText.id, target.id);
    connect(image.id, target.id);
    render(<StoreBackedImageNode nodeId={target.id} />);

    const textGroup = await screen.findByRole("button", { name: "文本输入，共 2 个节点" });
    fireEvent.mouseEnter(textGroup);
    fireEvent.click(screen.getByRole("menuitem", { name: "移除全部文本输入" }));

    await waitFor(() => expect(useFlowCanvasStore.getState().edges).toEqual([
      expect.objectContaining({ source: image.id, target: target.id }),
    ]));
  });

  it("keeps text ahead of image inputs when media is drag-reordered", async () => {
    const text = useFlowCanvasStore.getState().addNode("text", { x: 0, y: 0 }, { generationPrompt: "Connected text", title: "Text source" } as any);
    const firstImage = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 180 }, { assetId: "asset-ready", thumbnailUrl: "https://cdn.test/ready.png", title: "First image" } as any);
    const secondImage = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 360 }, { assetId: "asset-next", thumbnailUrl: "https://cdn.test/next.png", title: "Second image" } as any);
    const target = addImageTarget();
    connect(text.id, target.id);
    connect(firstImage.id, target.id);
    connect(secondImage.id, target.id);
    render(<StoreBackedImageNode nodeId={target.id} />);

    const tray = await screen.findByLabelText("节点输入");
    const firstImageCard = tray.querySelector('[aria-label^="输入 1：First image"]') as HTMLElement;
    const secondImageCard = tray.querySelector('[aria-label^="输入 2：Second image"]') as HTMLElement;
    fireEvent.dragStart(firstImageCard, { dataTransfer: { effectAllowed: "move", setData: vi.fn() } });
    fireEvent.drop(secondImageCard, { dataTransfer: { effectAllowed: "move", setData: vi.fn() } });

    await waitFor(() => expect(useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)?.data).toMatchObject({
      inputOrder: [`upstream:${text.id}`, `upstream:${secondImage.id}`, `upstream:${firstImage.id}`],
      referenceOrder: [`upstream:${secondImage.id}`, `upstream:${firstImage.id}`],
    }));
  });

  it("removes a direct reference from the image node without deleting its asset record", async () => {
    const target = useFlowCanvasStore.getState().addNode("image", { x: 480, y: 0 }, {
      createdAt: 1,
      generationPrompt: "local prompt",
      generationStatus: "idle",
      height: 220,
      kind: "image",
      referenceAssetItemIds: ["asset-direct-reference"],
      referenceOrder: ["asset:asset-direct-reference"],
      status: "idle",
      title: "Image target",
      updatedAt: 1,
      width: 320,
    } as FlowNodeData, { selected: true });
    render(<StoreBackedImageNode nodeId={target.id} />);

    await screen.findByLabelText("节点输入");
    fireEvent.click(screen.getByLabelText(/^移除输入 1：参考图片$/));

    await waitFor(() => expect(useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)?.data.referenceAssetItemIds).toEqual([]));
    expect(assetApiMocks.deleteAsset).not.toHaveBeenCalled();
  });

  it("persists a locally selected image as a project asset", async () => {
    useFlowCanvasStore.setState({ backendProjectId: "project-image-upload" });
    const target = addImageTarget();
    assetApiMocks.uploadAssetFile.mockResolvedValue({
      height: 768,
      id: "asset-uploaded-image",
      mimeType: "image/png",
      originalFilename: "local-image.png",
      source: "upload",
      title: "local-image",
      width: 1024,
    });
    assetApiMocks.getAssetVariantUrl.mockResolvedValue({
      url: "https://cdn.test/assets/asset-uploaded-image/preview.webp",
    });

    const { container } = render(<StoreBackedImageNode nodeId={target.id} />);
    const file = new File(["image"], "local-image.png", { type: "image/png" });
    const fileInput = container.querySelector('input[type="file"]:not([multiple])') as HTMLInputElement;

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(assetApiMocks.uploadAssetFile).toHaveBeenCalledWith({
      file,
      kind: "image",
      projectId: "project-image-upload",
    }));
    expect(useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)?.data).toMatchObject({
      assetId: "asset-uploaded-image",
      assetIds: ["asset-uploaded-image"],
      source: "node-upload",
    });
    expect(useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)?.data.referenceUploadId).toBeUndefined();
  });
});
