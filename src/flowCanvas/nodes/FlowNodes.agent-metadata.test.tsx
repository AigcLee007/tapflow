import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImageNodeComponent, TextNodeComponent } from "./FlowNodes";
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

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    Handle: () => null,
    NodeResizer: () => null,
    Position: { Left: "left", Right: "right" },
    useConnection: () => ({ connectionNodeId: null }),
    useReactFlow: () => ({
      flowToScreenPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
      getNode: () => null,
    }),
    useViewport: () => ({ zoom: 1 }),
  };
});

describe("FlowNodes agent metadata", () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().newProject();
    assetApiMocks.getAsset.mockReset();
    assetApiMocks.getAssetDownloadUrl.mockReset();
    assetApiMocks.getAssetVariantUrl.mockReset();
    assetApiMocks.uploadAssetFile.mockReset();
  });

  it("renders an Agent badge and opens session detail for text nodes", () => {
    const listener = vi.fn();
    window.addEventListener("tapflow:open-agent-session", listener as EventListener);

    render(
      <TextNodeComponent
        id="text-1"
        selected={false}
        data={{
          agentMetadata: {
            agentSessionId: "session-1",
            agentTurnId: "turn-1",
          },
          createdAt: 1,
          generationStatus: "idle",
          height: 180,
          kind: "text",
          status: "idle",
          text: "agent text",
          title: "Agent Prompt",
          updatedAt: 1,
          width: 240,
        } as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="text"
        xPos={0}
        yPos={0}
      />,
    );

    expect(screen.getByText("Agent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看 Agent 过程" }));
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0] as CustomEvent<{ sessionId: string; turnId?: string }>;
    expect(event.detail).toEqual({ sessionId: "session-1", turnId: "turn-1" });
    expect(screen.queryByText(/provider/i)).toBeNull();

    window.removeEventListener("tapflow:open-agent-session", listener as EventListener);
  });

  it("renders the Agent badge for image nodes without leaking provider info", () => {
    render(
      <ImageNodeComponent
        id="image-1"
        selected={false}
        data={{
          agentMetadata: {
            agentSessionId: "session-2",
            agentTurnId: "turn-2",
          },
          createdAt: 1,
          generationPrompt: "forest sports day",
          generationStatus: "idle",
          height: 240,
          kind: "image",
          status: "idle",
          title: "Agent Image",
          updatedAt: 1,
          width: 260,
        } as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="image"
        xPos={0}
        yPos={0}
      />,
    );

    expect(screen.getByText("Agent")).toBeTruthy();
    expect(screen.getByRole("button", { name: "查看 Agent 过程" })).toBeTruthy();
    expect(screen.queryByText(/provider/i)).toBeNull();
    expect(screen.queryByText(/baseurl/i)).toBeNull();
  });

  it("renders the main image thumbnail without cropping", () => {
    const { container } = render(
      <ImageNodeComponent
        id="image-preview-1"
        selected={false}
        data={{
          createdAt: 1,
          generationStatus: "done",
          height: 170,
          kind: "image",
          naturalHeight: 1024,
          naturalWidth: 1024,
          status: "success",
          thumbnailUrl: "https://cdn.test/square-preview.png",
          title: "Square Preview",
          updatedAt: 1,
          width: 170,
        } as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="image"
        xPos={0}
        yPos={0}
      />,
    );

    const image = container.querySelector('img[src="https://cdn.test/square-preview.png"]') as HTMLImageElement | null;

    expect(image).toBeTruthy();
    expect(image?.style.objectFit).toBe("contain");
  });

  it("keeps the image quantity menu open until a batch display mode is selected", () => {
    useFlowCanvasStore.getState().addNode(
      "image",
      { x: 0, y: 0 },
      {
        createdAt: 1,
        generationPrompt: "test prompt",
        generationStatus: "idle",
        height: 170,
        kind: "image",
        modelId: "pixellelabs.nano-banana-pro",
        params: {
          aspect_ratio: "1:1",
          size: "1k",
        },
        routeKey: "image.default",
        status: "idle",
        title: "Batch Image",
        updatedAt: 1,
        width: 170,
      } as any,
      { selected: true },
    );
    const node = useFlowCanvasStore.getState().nodes[0];

    render(
      <ImageNodeComponent
        id={node.id}
        selected
        data={node.data as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="image"
        xPos={0}
        yPos={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "1x" }));
    fireEvent.click(screen.getByRole("button", { name: "2x" }));

    expect(screen.getByTestId("image-batch-menu")).toBeTruthy();
    expect(useFlowCanvasStore.getState().nodes[0]?.data).toMatchObject({
      batchCount: 2,
      multiImageDisplayMode: "split_nodes",
    });

    fireEvent.click(screen.getByRole("button", { name: "合并显示" }));

    expect(screen.queryByTestId("image-batch-menu")).toBeNull();
    expect(useFlowCanvasStore.getState().nodes[0]?.data).toMatchObject({
      batchCount: 2,
      multiImageDisplayMode: "combined",
    });
  });

  it("shows a pending reference chip immediately after choosing a local reference image", async () => {
    const previousCreateObjectURL = URL.createObjectURL;
    const previousCreateImageBitmap = globalThis.createImageBitmap;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob://pending-reference"),
    });
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: vi.fn(() => new Promise(() => undefined)),
    });
    assetApiMocks.uploadAssetFile.mockReturnValue(new Promise(() => undefined));

    try {
      useFlowCanvasStore.getState().addNode(
        "image",
        { x: 0, y: 0 },
        {
          createdAt: 1,
          generationPrompt: "",
          generationStatus: "idle",
          height: 170,
          kind: "image",
          status: "idle",
          title: "Reference Target",
          updatedAt: 1,
          width: 170,
        } as any,
        { selected: true },
      );
      const node = useFlowCanvasStore.getState().nodes[0];

      const { container } = render(
        <ImageNodeComponent
          id={node.id}
          selected
          data={node.data as any}
          dragging={false}
          zIndex={1}
          isConnectable
          type="image"
          xPos={0}
          yPos={0}
        />,
      );

      const referenceInput = container.querySelector('input[type="file"][multiple]') as HTMLInputElement | null;
      expect(referenceInput).toBeTruthy();

      fireEvent.change(referenceInput!, {
        target: {
          files: [new File(["cat"], "cat.png", { type: "image/png" })],
        },
      });

      await waitFor(() => {
        expect(container.querySelector('img[src="blob://pending-reference"]')).toBeTruthy();
      });
      expect(assetApiMocks.uploadAssetFile).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "image" }),
      );
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: previousCreateObjectURL,
      });
      Object.defineProperty(globalThis, "createImageBitmap", {
        configurable: true,
        value: previousCreateImageBitmap,
      });
    }
  });

  it("does not insert a prompt mention when a local reference upload finishes", async () => {
    const previousCreateObjectURL = URL.createObjectURL;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob://uploaded-reference"),
    });
    assetApiMocks.uploadAssetFile.mockResolvedValue({
      createdAt: "2026-07-04T00:00:00.000Z",
      deletedAt: null,
      durationMs: null,
      favorite: false,
      height: 1024,
      id: "asset-upload-1",
      kind: "image",
      metadata: {},
      mimeType: "image/png",
      originalFilename: "cat.png",
      previewUrl: "https://cdn.test/cat-preview.png",
      sizeBytes: 3,
      tags: [],
      title: "cat",
      updatedAt: "2026-07-04T00:00:00.000Z",
      width: 1024,
    });

    try {
      useFlowCanvasStore.getState().addNode(
        "image",
        { x: 0, y: 0 },
        {
          createdAt: 1,
          generationPrompt: "",
          generationStatus: "idle",
          height: 170,
          kind: "image",
          status: "idle",
          title: "Reference Target",
          updatedAt: 1,
          width: 170,
        } as any,
        { selected: true },
      );
      const node = useFlowCanvasStore.getState().nodes[0];

      const { container } = render(
        <ImageNodeComponent
          id={node.id}
          selected
          data={node.data as any}
          dragging={false}
          zIndex={1}
          isConnectable
          type="image"
          xPos={0}
          yPos={0}
        />,
      );

      const referenceInput = container.querySelector('input[type="file"][multiple]') as HTMLInputElement | null;
      expect(referenceInput).toBeTruthy();

      fireEvent.change(referenceInput!, {
        target: {
          files: [new File(["cat"], "cat.png", { type: "image/png" })],
        },
      });

      await waitFor(() => {
        expect(useFlowCanvasStore.getState().nodes[0]?.data.uploadStatus).toBe("done");
      });

      expect(useFlowCanvasStore.getState().nodes[0]?.data).toMatchObject({
        generationPrompt: "",
        referenceAssetItemIds: ["asset-upload-1"],
      });
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: previousCreateObjectURL,
      });
    }
  });
});
