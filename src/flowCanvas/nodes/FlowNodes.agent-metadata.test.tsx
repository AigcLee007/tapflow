import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImageNodeComponent, TextNodeComponent, VideoNodeComponent } from "./FlowNodes";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

const assetApiMocks = vi.hoisted(() => ({
  getAsset: vi.fn(),
  getAssetDownloadUrl: vi.fn(),
  getAssetSignedUrls: vi.fn(),
  getAssetVariantUrl: vi.fn(),
  uploadAssetFile: vi.fn(),
}));
const workflowRunnerMocks = vi.hoisted(() => ({
  runBackendWorkflow: vi.fn(),
}));
const videoCatalogMocks = vi.hoisted(() => ({
  current: { error: null as string | null, loading: false, models: [] as any[], retry: vi.fn() },
}));
const textCatalogMocks = vi.hoisted(() => ({
  current: { error: null as string | null, loading: false, models: [] as any[], retry: vi.fn() },
}));
const useAssetLibraryMock = vi.hoisted(() => vi.fn());
const nodeResizerMock = vi.hoisted(() => vi.fn(() => null));

const createVideoCatalogModel = (overrides: Record<string, unknown> = {}) => ({
  blocker: null,
  capabilities: {
    aspectRatios: ["16:9"],
    confirmedByRoute: true,
    durationStepSeconds: 1,
    maxCount: 1,
    maxDurationSeconds: 8,
    minDurationSeconds: 4,
    resolutions: ["720P"],
    supportedModes: ["text_to_video"],
    supportsAudio: false,
    supportsHumanReview: false,
  },
  estimatedCredits: 1,
  id: "default-video-model",
  label: "Default video model",
  minChargeCredits: 1,
  modelKey: "default-video-model",
  pricing: { billingBasis: "duration_second", exact: true, minChargeCredits: 1, unit: "video_generation", unitCredits: 1 },
  routeKey: "video.default-route",
  ...overrides,
});

const createVideoNodeData = (overrides: Record<string, unknown> = {}) => ({
  createdAt: 1,
  generationStatus: "idle",
  height: 170,
  kind: "video",
  status: "idle",
  title: "Video",
  updatedAt: 1,
  width: 302,
  ...overrides,
});

function StoreBackedVideoNode({ nodeId, selected = true }: { nodeId: string; selected?: boolean }) {
  const node = useFlowCanvasStore((state) => state.nodes.find((item) => item.id === nodeId));
  return node ? <VideoNodeComponent id={node.id} selected={selected} data={node.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} /> : null;
}

function StoreBackedTextNode({ nodeId, selected = true }: { nodeId: string; selected?: boolean }) {
  const node = useFlowCanvasStore((state) => state.nodes.find((item) => item.id === nodeId));
  return node ? <TextNodeComponent id={node.id} selected={selected} data={node.data as any} dragging={false} zIndex={1} isConnectable type="text" xPos={0} yPos={0} /> : null;
}

vi.mock("../../assets/assetApi", () => ({
  getAsset: (...args: unknown[]) => assetApiMocks.getAsset(...args),
  getAssetDownloadUrl: (...args: unknown[]) => assetApiMocks.getAssetDownloadUrl(...args),
  getAssetSignedUrls: (...args: unknown[]) => assetApiMocks.getAssetSignedUrls(...args),
  getAssetVariantUrl: (...args: unknown[]) => assetApiMocks.getAssetVariantUrl(...args),
  uploadAssetFile: (...args: unknown[]) => assetApiMocks.uploadAssetFile(...args),
}));
vi.mock("../../assets/useAssetLibrary", () => ({
  useAssetLibrary: () => useAssetLibraryMock(),
}));
vi.mock("../runtime/v2WorkflowRunner", () => ({
  markBackendRunLaunchFailed: vi.fn(),
  runBackendWorkflow: (...args: unknown[]) => workflowRunnerMocks.runBackendWorkflow(...args),
}));
vi.mock("../video/useVideoGenerationCatalog", () => ({
  useVideoGenerationCatalog: () => videoCatalogMocks.current,
}));
vi.mock("../text/useTextGenerationCatalog", () => ({
  useTextGenerationCatalog: () => textCatalogMocks.current,
}));
vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    addEdge: (edge: any, edges: any[]) => [...edges, { id: edge.id || "edge-test", ...edge }],
    Handle: () => null,
    NodeResizer: nodeResizerMock,
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
    assetApiMocks.getAssetSignedUrls.mockReset();
    assetApiMocks.getAssetVariantUrl.mockReset();
    assetApiMocks.uploadAssetFile.mockReset();
    nodeResizerMock.mockClear();
    workflowRunnerMocks.runBackendWorkflow.mockReset();
    workflowRunnerMocks.runBackendWorkflow.mockResolvedValue(undefined);
    videoCatalogMocks.current = { error: null, loading: false, models: [], retry: vi.fn() };
    textCatalogMocks.current = { error: null, loading: false, models: [], retry: vi.fn() };
    useAssetLibraryMock.mockReset();
    useAssetLibraryMock.mockReturnValue({
      assets: [],
      error: null,
      favoriteOnly: false,
      folders: [],
      groupedAssets: [],
      loading: false,
      mediaCounts: { all: 0, audio: 0, image: 0, video: 0 },
      page: 1,
      pageSize: 30,
      query: "",
      refresh: vi.fn(async () => undefined),
      selectedFolderId: null,
      selectedMediaTab: "image",
      setFavoriteOnly: vi.fn(),
      setQuery: vi.fn(),
      setSelectedFolderId: vi.fn(),
      setSelectedMediaTab: vi.fn(),
      total: 0,
      updateAssetOptimistically: vi.fn(),
    });
  });

  it("renders all upstream input kinds in the TextNode input tray", async () => {
    const textSource = useFlowCanvasStore.getState().addNode("text", { x: 0, y: 0 }, { text: "Brief", title: "Text source" } as any);
    const imageSource = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 180 }, { assetId: "asset-image", thumbnailUrl: "https://cdn.test/image.png", title: "Image source" } as any);
    const videoSource = useFlowCanvasStore.getState().addNode("video", { x: 0, y: 360 }, { assetId: "asset-video", posterUrl: "https://cdn.test/video.png", title: "Video source" } as any);
    const audioSource = useFlowCanvasStore.getState().addNode("audio", { x: 0, y: 540 }, { title: "Audio source" } as any);
    const target = useFlowCanvasStore.getState().addNode("text", { x: 420, y: 0 }, { generationPrompt: "Generate", title: "Text target" } as any, { selected: true });
    for (const source of [textSource, imageSource, videoSource, audioSource]) {
      useFlowCanvasStore.getState().onConnect({ source: source.id, sourceHandle: "out", target: target.id, targetHandle: "in" });
    }

    render(<StoreBackedTextNode nodeId={target.id} />);

    const tray = await screen.findByLabelText("节点输入");
    expect(tray.querySelector('[data-input-kind="text"]')).toBeTruthy();
    expect(tray.querySelector('[data-input-kind="image"]')).toBeTruthy();
    expect(tray.querySelector('[data-input-kind="video"]')).toBeTruthy();
    expect(tray.querySelector('[data-input-kind="audio"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "文本输入，共 1 个节点" })).toBeTruthy();
    expect(tray.querySelector('[aria-label^="输入 1：Image source"]')).toBeTruthy();
    expect(tray.querySelector('[aria-label^="输入 1：Video source"]')).toBeTruthy();
    expect(screen.queryByRole("listbox", { name: "引用媒体" })).toBeNull();
  });

  it("focuses, previews, and removes media inputs from the TextNode tray", async () => {
    const imageSource = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 180 }, {
      assetId: "asset-image",
      thumbnailUrl: "https://cdn.test/image.png",
      title: "Image source",
    } as any);
    const target = useFlowCanvasStore.getState().addNode("text", { x: 420, y: 0 }, { generationPrompt: "Generate", title: "Text target" } as any, { selected: true });
    useFlowCanvasStore.getState().onConnect({ source: imageSource.id, sourceHandle: "out", target: target.id, targetHandle: "in" });

    render(<StoreBackedTextNode nodeId={target.id} />);

    const card = await screen.findByTestId("media-input-card");
    const trigger = card.querySelector('[role="button"]') as HTMLElement;
    fireEvent.mouseEnter(trigger);
    expect(await screen.findByRole("tooltip")).toBeTruthy();

    fireEvent.click(trigger);
    expect(useFlowCanvasStore.getState().nodes.find((node) => node.id === imageSource.id)?.selected).toBe(true);

    const removeButton = card.querySelector('button') as HTMLButtonElement;
    fireEvent.click(removeButton);
    await waitFor(() => {
      expect(useFlowCanvasStore.getState().edges.some((edge) => edge.source === imageSource.id && edge.target === target.id)).toBe(false);
    });
  });

  it('keeps the empty video preview passive and opens upload only from the top button', () => {
    const node = useFlowCanvasStore.getState().addNode('video', { x: 0, y: 0 }, {
      createdAt: 1,
      generationStatus: 'idle',
      height: 170,
      kind: 'video',
      status: 'idle',
      title: 'Upload video',
      updatedAt: 1,
      width: 302,
    } as any, { selected: true });
    const { container, getByTestId } = render(
      <VideoNodeComponent id={node.id} selected data={node.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} />,
    );
    const input = container.querySelector('input[type="file"][accept="video/*"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    const placeholder = getByTestId('video-empty-placeholder');

    fireEvent.click(placeholder);
    fireEvent.drop(placeholder, {
      dataTransfer: { files: [new File(['video'], 'dropped.mp4', { type: 'video/mp4' })] },
    });

    expect(clickSpy).not.toHaveBeenCalled();
    expect(assetApiMocks.uploadAssetFile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /上传/ }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("hydrates an unconfigured video node with Gemini in preference to another eligible model without overwriting a saved selection", async () => {
    const fallbackModel = createVideoCatalogModel({ id: "fallback-video-model", modelKey: "fallback-video-model", routeKey: "video.fallback-route" });
    const geminiModel = createVideoCatalogModel({ id: "gemini-video-model", modelKey: "gemini-omni-flash", routeKey: "video.gemini-route" });
    videoCatalogMocks.current = { error: null, loading: true, models: [], retry: vi.fn() };
    const node = useFlowCanvasStore.getState().addNode("video", { x: 0, y: 0 }, createVideoNodeData({ routeKey: "video.stale-route" }) as any, { selected: false });
    const updateNodeDataSpy = vi.spyOn(useFlowCanvasStore.getState(), "updateNodeData");
    const StoreBackedVideoNode = ({ refresh }: { refresh: number }) => {
      const currentNode = useFlowCanvasStore((state) => state.nodes.find((item) => item.id === node.id));
      return currentNode ? <VideoNodeComponent id={currentNode.id} selected={false} data={currentNode.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={refresh} yPos={0} /> : null;
    };
    const { rerender } = render(<StoreBackedVideoNode refresh={0} />);

    expect(useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)?.data.modelId).toBeUndefined();

    videoCatalogMocks.current = { error: null, loading: false, models: [fallbackModel, geminiModel], retry: vi.fn() };
    rerender(<StoreBackedVideoNode refresh={1} />);

    await waitFor(() => expect(useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)?.data).toMatchObject({
      modelId: "gemini-video-model",
      routeKey: "video.gemini-route",
    }));
    rerender(<StoreBackedVideoNode refresh={2} />);
    expect(useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)?.data.modelId).toBe("gemini-video-model");
    const modelSelectionWrites = () => updateNodeDataSpy.mock.calls.filter(([, patch]) => patch.modelId === "gemini-video-model");
    expect(modelSelectionWrites()).toHaveLength(1);

    videoCatalogMocks.current = { error: null, loading: false, models: [fallbackModel, geminiModel], retry: vi.fn() };
    rerender(<StoreBackedVideoNode refresh={3} />);
    expect(modelSelectionWrites()).toHaveLength(1);

    const saved = useFlowCanvasStore.getState().addNode("video", { x: 0, y: 0 }, createVideoNodeData({ modelId: "saved-model", routeKey: "video.saved-route" }) as any, { selected: false });
    render(<VideoNodeComponent id={saved.id} selected={false} data={saved.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} />);
    expect(useFlowCanvasStore.getState().nodes.find((item) => item.id === saved.id)?.data).toMatchObject({
      modelId: "saved-model",
      routeKey: "video.saved-route",
    });
  });

  it("does not hydrate an unconfigured video node when the catalog has failed", () => {
    videoCatalogMocks.current = {
      error: "catalog unavailable",
      loading: false,
      models: [createVideoCatalogModel()],
      retry: vi.fn(),
    };
    const node = useFlowCanvasStore.getState().addNode("video", { x: 0, y: 0 }, createVideoNodeData() as any, { selected: false });

    render(<VideoNodeComponent id={node.id} selected={false} data={node.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} />);

    expect(useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)?.data.modelId).toBeUndefined();
  });

  it('does not render a NodeResizer for any selected video state', () => {
    const node = useFlowCanvasStore.getState().addNode('video', { x: 0, y: 0 }, {
      createdAt: 1,
      generationStatus: 'idle',
      kind: 'video',
      status: 'idle',
      title: 'Video',
      updatedAt: 1,
    } as any, { selected: true });

    render(<VideoNodeComponent id={node.id} selected data={node.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} />);

    expect(nodeResizerMock).not.toHaveBeenCalled();
  });

  it('resolves direct video reference variants even when the asset has a legacy preview URL', async () => {
    assetApiMocks.getAsset.mockResolvedValue({
      durationMs: 4_000,
      id: 'asset-direct-video',
      kind: 'video',
      previewUrl: 'https://cdn.test/legacy-video-preview.mp4',
      title: 'Direct clip',
    });
    assetApiMocks.getAssetVariantUrl.mockImplementation(async (_assetId: string, variant: string) => ({
      url: variant === 'thumb' ? 'https://cdn.test/direct-video-thumb.webp' : 'https://cdn.test/direct-video-preview.mp4',
    }));
    const node = useFlowCanvasStore.getState().addNode('video', { x: 0, y: 0 }, createVideoNodeData({
      params: {
        videoGeneration: {
          aspectRatio: '16:9',
          count: 1,
          durationSeconds: 4,
          generateAudio: false,
          mode: 'video_to_video',
          referenceInputs: [{
            mediaKind: 'video',
            order: 0,
            referenceKey: 'asset:asset-direct-video',
            role: 'reference_video',
            source: { id: 'asset-direct-video', kind: 'asset' },
          }],
          resolution: '720P',
          schemaVersion: 2,
        },
      },
    }) as any, { selected: true });

    render(<StoreBackedVideoNode nodeId={node.id} />);

    await waitFor(() => {
      expect(assetApiMocks.getAssetVariantUrl).toHaveBeenCalledWith('asset-direct-video', 'thumb');
      expect(assetApiMocks.getAssetVariantUrl).toHaveBeenCalledWith('asset-direct-video', 'preview');
    });
    const preview = document.querySelector('[aria-label="节点输入"] img');
    expect(preview?.getAttribute('src')).toBe('https://cdn.test/direct-video-thumb.webp');
  });

  it("keeps one stable image-to-video reference when a legacy draft has multiple image edges", async () => {
    const model = createVideoCatalogModel({
      capabilities: {
        aspectRatios: ["16:9"],
        audioControlMode: "unsupported",
        confirmedByRoute: true,
        durationStepSeconds: 2,
        maxCount: 1,
        maxDurationSeconds: 8,
        maxImages: 2,
        maxTotal: 2,
        maxVideos: 0,
        minDurationSeconds: 4,
        modeConstraints: { image_to_video: { maxImages: 1, maxTotal: 1, minImages: 1 } },
        referenceSemantics: "ordered_first_last_frames",
        resolutions: ["720P"],
        supportedDurations: [4, 6, 8],
        supportedModes: ["image_to_video"],
        supportsAudio: false,
        supportsHumanReview: false,
      },
      id: "veo-id",
      modelKey: "veo31-fast",
      routeKey: "video.pixelhub.veo31-fast",
    });
    videoCatalogMocks.current = { error: null, loading: false, models: [model], retry: vi.fn() };
    const first = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 0 }, { assetId: "asset-first", kind: "image", title: "First" });
    const second = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 240 }, { assetId: "asset-second", kind: "image", title: "Second" });
    const target = useFlowCanvasStore.getState().addNode("video", { x: 320, y: 0 }, createVideoNodeData({
      modelId: model.id,
      params: {
        videoGeneration: {
          aspectRatio: "16:9",
          count: 1,
          durationSeconds: 4,
          generateAudio: false,
          mode: "image_to_video",
          referenceInputs: [],
          resolution: "720P",
          schemaVersion: 2,
        },
      },
      routeKey: model.routeKey,
    }) as any, { selected: true });
    useFlowCanvasStore.getState().onConnect({ source: first.id, sourceHandle: "out", target: target.id, targetHandle: "in" });
    useFlowCanvasStore.getState().onConnect({ source: second.id, sourceHandle: "out", target: target.id, targetHandle: "in" });

    render(<StoreBackedVideoNode nodeId={target.id} />);

    await waitFor(() => {
      const current = useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id);
      const references = (current?.data.params as any)?.videoGeneration?.referenceInputs ?? [];
      expect(references).toHaveLength(1);
      expect(references[0]?.source).toEqual({ kind: "upstream", id: second.id });
    });
  });

  it("projects persisted first and last frame roles onto connected image inputs", async () => {
    const model = createVideoCatalogModel({
      capabilities: {
        aspectRatios: ["16:9"],
        confirmedByRoute: true,
        durationStepSeconds: 1,
        maxCount: 1,
        maxDurationSeconds: 8,
        maxImages: 2,
        maxTotal: 2,
        minDurationSeconds: 4,
        referenceSemantics: "ordered_first_last_frames",
        resolutions: ["720P"],
        supportedModes: ["first_last_frame"],
        supportsAudio: false,
        supportsHumanReview: false,
      },
      id: "first-last-model",
    });
    videoCatalogMocks.current = { error: null, loading: false, models: [model], retry: vi.fn() };
    const first = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 0 }, { assetId: "asset-first", kind: "image", title: "First" });
    const last = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 240 }, { assetId: "asset-last", kind: "image", title: "Last" });
    const target = useFlowCanvasStore.getState().addNode("video", { x: 320, y: 0 }, createVideoNodeData({
      modelId: model.id,
      params: {
        videoGeneration: {
          aspectRatio: "16:9",
          count: 1,
          durationSeconds: 4,
          generateAudio: false,
          mode: "first_last_frame",
          referenceInputs: [
            { mediaKind: "image", order: 0, referenceKey: `upstream:${first.id}`, role: "first_frame", source: { kind: "upstream", id: first.id } },
            { mediaKind: "image", order: 1, referenceKey: `upstream:${last.id}`, role: "last_frame", source: { kind: "upstream", id: last.id } },
          ],
          resolution: "720P",
          schemaVersion: 2,
        },
      },
    }) as any, { selected: true });
    useFlowCanvasStore.getState().onConnect({ source: first.id, sourceHandle: "out", target: target.id, targetHandle: "in" });
    useFlowCanvasStore.getState().onConnect({ source: last.id, sourceHandle: "out", target: target.id, targetHandle: "in" });

    render(<StoreBackedVideoNode nodeId={target.id} />);

    expect(await screen.findByLabelText("输入角色：首帧")).toBeTruthy();
    expect(screen.getByLabelText("输入角色：尾帧")).toBeTruthy();
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

  it("renders a failed text generation without crashing the canvas", () => {
    expect(() => {
      render(
        <TextNodeComponent
          id="text-error-1"
          selected={false}
          data={{
            createdAt: 1,
            errorMessage: "Text generation failed",
            generationStatus: "error",
            height: 180,
            kind: "text",
            status: "failed",
            text: "",
            title: "Failed Text",
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
    }).not.toThrow();

    expect(screen.getByText(/Text generation failed/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
  });

  it("shows only database text models and persists the selected real route", () => {
    textCatalogMocks.current = {
      error: null,
      loading: false,
      models: [{
        defaultRoute: {
          credits: 2,
          id: "route-real-1",
          label: "线路一",
          providerKey: "openai-compatible",
          routeKey: "text.real.line-1",
        },
        id: "real-text-model",
        label: "真实文本模型",
        logoKey: "openai",
        manufacturer: "GPT",
        modelFamily: "real-text-family",
        modelKey: "real-text-model",
        routes: [
          {
            credits: 2,
            id: "route-real-1",
            label: "线路一",
            providerKey: "openai-compatible",
            routeKey: "text.real.line-1",
          },
          {
            credits: 4,
            id: "route-real-2",
            label: "线路二",
            providerKey: "openai-compatible",
            routeKey: "text.real.line-2",
          },
        ],
      }],
      retry: vi.fn(),
    };
    const node = useFlowCanvasStore.getState().addNode("text", { x: 0, y: 0 }, {
      generationPrompt: "写一段文案",
      modelId: "real-text-model",
      routeId: "route-real-1",
      routeKey: "text.real.line-1",
    }, { selected: true });

    render(
      <TextNodeComponent
        id={node.id}
        selected
        data={node.data as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="text"
        xPos={0}
        yPos={0}
      />,
    );

    fireEvent.click(screen.getByTitle("选择文本模型"));

    expect(screen.getAllByText("真实文本模型")).toHaveLength(3);
    expect(screen.getByText("GPT")).toBeTruthy();
    expect(screen.getByText("线路一")).toBeTruthy();
    expect(screen.getByText("线路二")).toBeTruthy();
    expect(screen.queryByText("Gemini 3.1 Pro Preview")).toBeNull();
    expect(screen.queryByText("Claude Opus 4.6")).toBeNull();

    const openAiLogos = Array.from(document.querySelectorAll('img[src="/openai-icon.svg"]'));
    expect(openAiLogos.length).toBeGreaterThan(0);
    expect(openAiLogos.every((logo) => logo.style.filter === 'brightness(0) invert(1)')).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /真实文本模型.*线路二/ }));

    expect(useFlowCanvasStore.getState().nodes[0]?.data).toMatchObject({
      modelId: "real-text-model",
      routeId: "route-real-2",
      routeKey: "text.real.line-2",
    });
  });

  it("shows an empty text catalog and blocks generation before the workflow runner", () => {
    const node = useFlowCanvasStore.getState().addNode("text", { x: 0, y: 0 }, {
      generationPrompt: "写一段文案",
      modelId: undefined,
      routeId: undefined,
      routeKey: undefined,
    }, { selected: true });

    render(
      <TextNodeComponent
        id={node.id}
        selected
        data={node.data as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="text"
        xPos={0}
        yPos={0}
      />,
    );

    expect(screen.getAllByText("未配置")).toHaveLength(2);
    fireEvent.click(screen.getByTitle("选择文本模型"));
    expect(screen.getByText("暂无可用文本模型")).toBeTruthy();

    fireEvent.click(screen.getByTitle("开始生成"));

    expect(workflowRunnerMocks.runBackendWorkflow).not.toHaveBeenCalled();
    expect(useFlowCanvasStore.getState().nodes[0]?.data).toMatchObject({
      errorCode: "NO_TEXT_GENERATION_ROUTE",
      generationStatus: "error",
      status: "failed",
    });
    expect(String(useFlowCanvasStore.getState().nodes[0]?.data.errorMessage)).toContain("文本模型线路");
  });

  it("closes the database text model menu with Escape", () => {
    textCatalogMocks.current = {
      error: null,
      loading: false,
      models: [{
        defaultRoute: {
          credits: 2,
          id: "route-real-1",
          label: "线路一",
          providerKey: "real-provider",
          routeKey: "text.real.line-1",
        },
        id: "real-text-model",
        label: "真实文本模型",
        modelFamily: "real-text-family",
        modelKey: "real-text-model",
        routes: [{
          credits: 2,
          id: "route-real-1",
          label: "线路一",
          providerKey: "real-provider",
          routeKey: "text.real.line-1",
        }],
      }],
      retry: vi.fn(),
    };
    const node = useFlowCanvasStore.getState().addNode("text", { x: 0, y: 0 }, {
      modelId: "real-text-model",
      routeId: "route-real-1",
      routeKey: "text.real.line-1",
    }, { selected: true });

    render(
      <TextNodeComponent
        id={node.id}
        selected
        data={node.data as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="text"
        xPos={0}
        yPos={0}
      />,
    );

    fireEvent.click(screen.getByTitle("选择文本模型"));
    expect(screen.getByText("线路一")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("线路一")).toBeNull();
  });

  it("recovers the active persisted video result through its asset id", async () => {
    assetApiMocks.getAssetDownloadUrl.mockResolvedValue({
      expiresAt: "2026-07-16T00:15:00.000Z",
      method: "GET",
      url: "https://cdn.test/video-two.mp4?X-Amz-Signature=fresh",
    });

    const { container } = render(
      <VideoNodeComponent
        id="video-1"
        selected={false}
        data={{
          activeResultIndex: 1,
          createdAt: 1,
          generatedResults: [
            { createdAt: 1, id: "asset:video-one", url: "https://cdn.test/video-one.mp4?X-Amz-Signature=stale" },
            { createdAt: 1, id: "asset:video-two", url: "blob:http://localhost/video-two" },
          ],
          height: 170,
          kind: "video",
          posterUrl: "data:video/mp4;base64,unsafe",
          status: "idle",
          title: "Video",
          updatedAt: 1,
          width: 240,
        } as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="video"
        xPos={0}
        yPos={0}
      />,
    );

    await waitFor(() => {
      expect(assetApiMocks.getAssetDownloadUrl).toHaveBeenCalledWith("video-two");
      expect(container.querySelector("video")?.getAttribute("src")).toBe("https://cdn.test/video-two.mp4?X-Amz-Signature=fresh");
      expect(container.querySelector("video")?.style.objectFit).toBe("contain");
    });
  });

  it('uploads an empty video node as an asset-backed ready video without retaining a local URL', async () => {
    useFlowCanvasStore.getState().setBackendFlowBinding({ backendProjectId: 'project-video-upload' });
    assetApiMocks.uploadAssetFile.mockResolvedValue({
      durationMs: null,
      height: 1920,
      id: 'asset-uploaded-video',
      kind: 'video',
      mimeType: 'video/mp4',
      width: 1080,
    });
    assetApiMocks.getAssetDownloadUrl.mockImplementation(async (assetId: string) => ({
      expiresAt: '2026-08-04T12:00:00.000Z',
      method: 'GET',
      url: `https://cdn.test/${assetId}.mp4?X-Amz-Signature=fresh`,
    }));
    const previousCreateObjectURL = URL.createObjectURL;
    const previousRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:local-video') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'video') {
        Object.defineProperties(element, {
          duration: { configurable: true, value: 8.25 },
          videoHeight: { configurable: true, value: 1920 },
          videoWidth: { configurable: true, value: 1080 },
        });
        queueMicrotask(() => element.dispatchEvent(new Event('loadedmetadata')));
      }
      return element;
    }) as typeof document.createElement);

    try {
      const node = useFlowCanvasStore.getState().addNode('video', { x: 0, y: 0 }, {
        createdAt: 1,
        generationStatus: 'idle',
        height: 170,
        kind: 'video',
        status: 'idle',
        title: 'Upload video',
        updatedAt: 1,
        width: 302,
      } as any, { selected: true });
      const { container, rerender } = render(<VideoNodeComponent id={node.id} selected data={node.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} />);
      const input = container.querySelector('input[type="file"][accept="video/*"]') as HTMLInputElement | null;
      expect(input).toBeTruthy();

      fireEvent.change(input!, { target: { files: [new File(['video'], 'portrait.mp4', { type: 'video/mp4' })] } });

      await waitFor(() => {
        expect(assetApiMocks.uploadAssetFile).toHaveBeenCalledWith({
          durationMs: 8250,
          file: expect.any(File),
          height: 1920,
          kind: 'video',
          projectId: 'project-video-upload',
          width: 1080,
        });
        expect(useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)?.data).toMatchObject({
          aspectRatio: 1080 / 1920,
          assetId: 'asset-uploaded-video',
          assetIds: ['asset-uploaded-video'],
          durationMs: 8250,
          generationStatus: 'done',
          mimeType: 'video/mp4',
          naturalHeight: 1920,
          naturalWidth: 1080,
          source: 'upload',
          status: 'success',
          height: 302,
          width: 170,
        });
      });
      const persisted = useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)?.data as Record<string, unknown>;
      expect(Object.values(persisted).some((value) => typeof value === 'string' && /^(blob:|data:|https?:\/\/.*signature)/i.test(value))).toBe(false);
      expect(container.querySelector('input[type="file"]')).toBeNull();
      expect(screen.getByRole('button', { name: '下载视频' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /上传|替换/ })).toBeNull();
      act(() => {
        useFlowCanvasStore.getState().updateNodeData(node.id, {
          assetId: 'asset-generated-video',
          assetIds: ['asset-generated-video'],
          source: 'generate',
        });
      });
      const generatedNode = useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)!;
      rerender(<VideoNodeComponent id={node.id} selected data={generatedNode.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} />);
      await waitFor(() => {
        expect(assetApiMocks.getAssetDownloadUrl).toHaveBeenCalledWith('asset-generated-video');
        expect(container.querySelector('video')?.getAttribute('src')).toContain('asset-generated-video.mp4');
      });
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-video');
    } finally {
      vi.restoreAllMocks();
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: previousCreateObjectURL });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: previousRevokeObjectURL });
    }
  });

  it('keeps a successfully uploaded video ready when its temporary preview URL cannot be signed', async () => {
    useFlowCanvasStore.getState().setBackendFlowBinding({ backendProjectId: 'project-video-upload' });
    assetApiMocks.uploadAssetFile.mockResolvedValue({
      durationMs: 4000,
      height: 720,
      id: 'asset-uploaded-video-no-preview',
      kind: 'video',
      mimeType: 'video/mp4',
      width: 1280,
    });
    assetApiMocks.getAssetDownloadUrl.mockRejectedValue(new Error('preview signing failed'));
    const previousCreateObjectURL = URL.createObjectURL;
    const previousRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:local-video') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'video') {
        Object.defineProperties(element, {
          duration: { configurable: true, value: 4 },
          videoHeight: { configurable: true, value: 720 },
          videoWidth: { configurable: true, value: 1280 },
        });
        queueMicrotask(() => element.dispatchEvent(new Event('loadedmetadata')));
      }
      return element;
    }) as typeof document.createElement);

    function StoredVideoNode({ nodeId }: { nodeId: string }) {
      const node = useFlowCanvasStore((state) => state.nodes.find((item) => item.id === nodeId));
      if (!node) return null;
      return <VideoNodeComponent id={node.id} selected data={node.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} />;
    }

    try {
      const node = useFlowCanvasStore.getState().addNode('video', { x: 0, y: 0 }, {
        createdAt: 1,
        generationStatus: 'idle',
        height: 170,
        kind: 'video',
        status: 'idle',
        title: 'Upload video',
        updatedAt: 1,
        width: 302,
      } as any, { selected: true });
      const { container } = render(<StoredVideoNode nodeId={node.id} />);
      const input = container.querySelector('input[type="file"][accept="video/*"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['video'], 'landscape.mp4', { type: 'video/mp4' })] } });

      await waitFor(() => expect(assetApiMocks.getAssetDownloadUrl).toHaveBeenCalledWith('asset-uploaded-video-no-preview'));
      await waitFor(() => expect(useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)?.data).toMatchObject({
        aspectRatio: 1280 / 720,
        assetId: 'asset-uploaded-video-no-preview',
        assetIds: ['asset-uploaded-video-no-preview'],
        durationMs: 4000,
        generationStatus: 'done',
        naturalHeight: 720,
        naturalWidth: 1280,
        source: 'upload',
        status: 'success',
      }));
      expect(container.querySelector('input[type="file"]')).toBeNull();
      expect(screen.getByRole('button', { name: '下载视频' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '全屏预览' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /上传|替换/ })).toBeNull();
    } finally {
      vi.restoreAllMocks();
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: previousCreateObjectURL });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: previousRevokeObjectURL });
    }
  });

  it("replaces an expired generated image result URL with the fresh signed URL", async () => {
    assetApiMocks.getAssetSignedUrls.mockResolvedValue({
      items: [{
        assetId: "asset-expired-image",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        method: "GET",
        requestedVariantKey: "thumb",
        servedVariantKey: "thumb",
        status: "ok",
        url: "https://cdn.test/fresh-image.png?X-Amz-Signature=fresh",
        variantKey: "thumb",
      }],
    });

    const { container } = render(
      <ImageNodeComponent
        id="image-expired-1"
        selected={false}
        data={{
          assetId: "asset-expired-image",
          coverResultId: "asset:asset-expired-image",
          generatedResults: [{
            assetId: "asset-expired-image",
            createdAt: 1,
            id: "asset:asset-expired-image",
            url: "https://cdn.test/expired-image.png?X-Amz-Signature=stale",
          }],
          generationStatus: "done",
          height: 220,
          kind: "image",
          lastGenerationSnapshot: { modelId: "test-model" },
          status: "success",
          title: "Expired image",
          width: 220,
        } as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="image"
        xPos={0}
        yPos={0}
      />,
    );

    expect(container.querySelector('img[src="https://cdn.test/expired-image.png?X-Amz-Signature=stale"]')).toBeNull();
    await waitFor(() => {
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        "https://cdn.test/fresh-image.png?X-Amz-Signature=fresh",
      );
    });
    expect(assetApiMocks.getAssetSignedUrls).toHaveBeenCalledWith([
      { allowVariantFallback: true, assetId: "asset-expired-image", variantKey: "thumb" },
    ]);
  });

  it("resolves fullscreen preview for the active generated result", async () => {
    assetApiMocks.getAssetSignedUrls.mockImplementation(async (requests: Array<{ assetId: string; variantKey: string }>) => ({
      items: requests.map((request) => ({
        assetId: request.assetId,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        method: "GET",
        requestedVariantKey: request.variantKey,
        servedVariantKey: request.variantKey,
        status: "ok",
        url: `https://cdn.test/${request.assetId}-${request.variantKey}.webp`,
        variantKey: request.variantKey,
      })),
    }));
    const source = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 0 }, {}, { selected: true });

    render(
      <ImageNodeComponent
        id={source.id}
        selected
        data={{
          activeResultIndex: 1,
          assetId: "asset-primary",
          createdAt: 1,
          generatedResults: [
            { assetId: "asset-primary", createdAt: 1, id: "asset:asset-primary" },
            { assetId: "asset-selected", createdAt: 2, id: "asset:asset-selected" },
          ],
          generationStatus: "done",
          height: 220,
          kind: "image",
          lastGenerationSnapshot: { modelId: "test-model" },
          status: "success",
          title: "Batch preview",
          width: 220,
        } as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="image"
        xPos={0}
        yPos={0}
      />,
    );

    fireEvent.doubleClick(await screen.findByAltText(""));

    await waitFor(() => {
      expect(assetApiMocks.getAssetSignedUrls).toHaveBeenCalledWith([
        { allowVariantFallback: true, assetId: "asset-selected", variantKey: "preview" },
      ]);
      expect(screen.getByAltText("Fullscreen").getAttribute("src")).toBe(
        "https://cdn.test/asset-selected-preview.webp",
      );
    });
  });

  it("limits repeated image-load failures to one refresh per failed URL", async () => {
    assetApiMocks.getAssetSignedUrls.mockResolvedValue({
      items: [{
        assetId: "asset-retry-once",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        method: "GET",
        requestedVariantKey: "thumb",
        servedVariantKey: "thumb",
        status: "ok",
        url: "https://cdn.test/retry-once-fresh.png?X-Amz-Signature=fresh",
        variantKey: "thumb",
      }],
    });

    const { container } = render(
      <ImageNodeComponent
        id="image-retry-once"
        selected={false}
        data={{
          assetId: "asset-retry-once",
          generatedResults: [{
            assetId: "asset-retry-once",
            createdAt: 1,
            id: "asset:asset-retry-once",
            url: "https://cdn.test/retry-once-stale.png?X-Amz-Signature=stale",
          }],
          generationStatus: "done",
          height: 220,
          kind: "image",
          status: "success",
          title: "Retry once",
          width: 220,
        } as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="image"
        xPos={0}
        yPos={0}
      />,
    );

    const image = await waitFor(() => {
      const element = container.querySelector("img");
      expect(element?.getAttribute("src")).toBe(
        "https://cdn.test/retry-once-fresh.png?X-Amz-Signature=fresh",
      );
      return element;
    });

    fireEvent.error(image!);
    await waitFor(() => expect(assetApiMocks.getAssetSignedUrls).toHaveBeenCalledTimes(2));
    fireEvent.error(image!);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(assetApiMocks.getAssetSignedUrls).toHaveBeenCalledTimes(2);
  });

  it("blocks unconfigured video generation before it reaches the workflow runner", () => {
    const node = useFlowCanvasStore.getState().addNode(
      "video",
      { x: 0, y: 0 },
      {
        createdAt: 1,
        generationPrompt: "private scene description",
        generationStatus: "idle",
        height: 170,
        kind: "video",
        modelId: "editor-only-video",
        params: { videoGeneration: { schemaVersion: 1, mode: "text_to_video", aspectRatio: "auto", resolution: "720P", durationSeconds: 4, generateAudio: false, count: 1, cameraMotionId: null, visualTone: null, contextPaletteRefs: [], humanReview: { status: "not_required" }, referenceRolesByKey: {} } },
        status: "idle",
        title: "Video",
        updatedAt: 1,
        width: 240,
      } as any,
      { selected: true },
    );

    render(<VideoNodeComponent id={node.id} selected data={node.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} />);

    expect(screen.queryByText(/112/)).toBeNull();
    expect(screen.getByText("未配置")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "生成视频" }));

    expect(workflowRunnerMocks.runBackendWorkflow).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "生成视频" }) as HTMLButtonElement).disabled).toBe(true);
    expect(useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)?.data).toMatchObject({ generationStatus: "idle", status: "idle" });
  });

  it('synchronizes an empty video node to its requested portrait ratio', async () => {
    const node = useFlowCanvasStore.getState().addNode('video', { x: 0, y: 0 }, {
      createdAt: 1,
      generationStatus: 'idle',
      height: 170,
      kind: 'video',
      params: { videoGeneration: { aspectRatio: '9:16' } },
      status: 'idle',
      title: 'Portrait video',
      updatedAt: 1,
      width: 302,
    } as any, { selected: true });

    render(<VideoNodeComponent id={node.id} selected data={node.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} />);

    await waitFor(() => expect(useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)?.data).toMatchObject({
      aspectRatio: 9 / 16,
      height: 302,
      width: 170,
    }));
  });

  it("persists the confirmed route and normalized v2 parameters before launching video generation", () => {
    videoCatalogMocks.current = {
      error: null,
      loading: false,
      models: [{
        blocker: null,
        capabilities: {
          aspectRatios: ["16:9"],
          audioControlMode: "always_on_implicit",
          confirmedByRoute: true,
          durationStepSeconds: 2,
          maxCount: 1,
          maxDurationSeconds: 10,
          minDurationSeconds: 4,
          resolutions: ["720P"],
          supportedDurations: [4, 6, 8, 10],
          supportedModes: ["text_to_video"],
          supportsAudio: true,
          supportsHumanReview: false,
        },
        estimatedCredits: 1,
        id: "gemini-catalog-id",
        label: "Gemini Omni Flash",
        minChargeCredits: 4,
        modelKey: "gemini-omni-flash",
        pricing: { billingBasis: "duration_second", exact: true, minChargeCredits: 4, unit: "video_generation", unitCredits: 1 },
        routeKey: "video.pixelhub.gemini-omni-flash",
      }],
      retry: vi.fn(),
    };
    const node = useFlowCanvasStore.getState().addNode(
      "video",
      { x: 0, y: 0 },
      {
        createdAt: 1,
        generationPrompt: "A bright city street at dawn",
        generationStatus: "idle",
        height: 170,
        kind: "video",
        modelId: "gemini-catalog-id",
        params: { videoGeneration: { aspectRatio: "9:16", cameraMotionId: null, count: 1, durationSeconds: 5, generateAudio: false, mode: "text_to_video", referenceInputs: [], resolution: "1080P", schemaVersion: 2, visualTone: null } },
        routeKey: "stale-route-key",
        status: "idle",
        title: "Video",
        updatedAt: 1,
        width: 240,
      } as any,
      { selected: true },
    );

    render(<VideoNodeComponent id={node.id} selected data={node.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} />);
    fireEvent.click(screen.getByRole("button", { name: "生成视频" }));

    expect(workflowRunnerMocks.runBackendWorkflow).toHaveBeenCalledWith({ runMode: "target_node", targetNodeId: node.id });
    expect(useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)?.data).toMatchObject({
      routeKey: "video.pixelhub.gemini-omni-flash",
      params: {
        videoGeneration: {
          aspectRatio: "16:9",
          durationSeconds: 4,
          generateAudio: true,
          resolution: "720P",
          schemaVersion: 2,
        },
      },
    });
  });

  it("shows submitting feedback immediately and locks the composer after Generate", () => {
    const model = createVideoCatalogModel({ id: "gemini-id", modelKey: "gemini-omni-flash", routeKey: "video.pixelhub.gemini-omni-flash" });
    videoCatalogMocks.current = { error: null, loading: false, models: [model], retry: vi.fn() };
    const node = useFlowCanvasStore.getState().addNode("video", { x: 0, y: 0 }, createVideoNodeData({ generationPrompt: "A moving train", modelId: "gemini-id", routeKey: model.routeKey }) as any, { selected: true });

    render(<StoreBackedVideoNode nodeId={node.id} />);
    fireEvent.click(screen.getByRole("button", { name: "生成视频" }));

    expect(screen.getByRole("status").textContent).toContain("正在提交任务");
    expect((screen.getByRole("button", { name: "生成中" }) as HTMLButtonElement).disabled).toBe(true);
    expect(workflowRunnerMocks.runBackendWorkflow).toHaveBeenCalledTimes(1);
  });

  it("keeps provider-wait feedback visible when the node is unselected", () => {
    const node = useFlowCanvasStore.getState().addNode("video", { x: 0, y: 0 }, createVideoNodeData({ generationStatus: "generating", modelId: "gemini-id" }) as any, { selected: false });
    useFlowCanvasStore.setState((state) => ({ nodeRunStatusByNodeId: { ...state.nodeRunStatusByNodeId, [node.id]: "waiting_provider" } }));

    render(<StoreBackedVideoNode nodeId={node.id} selected={false} />);

    expect(screen.getByRole("status").textContent).toContain("正在生成视频");
    expect(screen.queryByLabelText("视频创作面板")).toBeNull();
  });

  it("retries a failed video through the normal generation handler", () => {
    const model = createVideoCatalogModel({ id: "gemini-id", modelKey: "gemini-omni-flash", routeKey: "video.pixelhub.gemini-omni-flash" });
    videoCatalogMocks.current = { error: null, loading: false, models: [model], retry: vi.fn() };
    const node = useFlowCanvasStore.getState().addNode("video", { x: 0, y: 0 }, createVideoNodeData({ errorMessage: "生成失败", generationPrompt: "A moving train", generationStatus: "error", modelId: "gemini-id", routeKey: model.routeKey, status: "error" }) as any, { selected: true });

    render(<StoreBackedVideoNode nodeId={node.id} />);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(workflowRunnerMocks.runBackendWorkflow).toHaveBeenCalledWith({ runMode: "target_node", targetNodeId: node.id });
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

  it("renders the image generation state as an animated preview surface", () => {
    const { container } = render(
      <ImageNodeComponent
        id="image-generating-1"
        selected={false}
        data={{
          createdAt: 1,
          generationStatus: "generating",
          height: 220,
          kind: "image",
          progress: 5,
          status: "running",
          title: "Generating Preview",
          updatedAt: 1,
          width: 320,
        } as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="image"
        xPos={0}
        yPos={0}
      />,
    );

    expect(container.querySelector(".flow-generating-preview")).toBeTruthy();
    expect(container.querySelector(".flow-generating-orb")).toBeTruthy();
    expect(screen.getByText("5% 生成中")).toBeTruthy();
  });

  it("renders a panorama generate entry in the image toolbar and creates a configured panorama target node", async () => {
    const source = useFlowCanvasStore.getState().addNode(
      "image",
      { x: 0, y: 0 },
      {
        createdAt: 1,
        generationStatus: "done",
        height: 240,
        kind: "image",
        modelId: "gpt-image-2",
        status: "success",
        routeKey: "image.gpt-image-2",
        thumbnailUrl: "https://cdn.test/panorama-source.png",
        title: "Panorama Source",
        updatedAt: 1,
        width: 260,
      } as any,
      { selected: true },
    );

    render(
      <ImageNodeComponent
        id={source.id}
        selected
        data={source.data as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="image"
        xPos={0}
        yPos={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "360 全景生成" }));

    await screen.findByRole("dialog", { name: "360 全景生成" });
    expect(useFlowCanvasStore.getState().nodes.find((node) => node.id === source.id)?.data.generationMode).toBeUndefined();
    expect(screen.getByRole("button", { name: /全景模型 GPT-Image-2/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /全景清晰度 1K/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2:1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "21:9" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "21:9" }));
    fireEvent.click(screen.getByRole("button", { name: "生成全景" }));

    const created = useFlowCanvasStore.getState().nodes.find((node) => node.id !== source.id && node.type === "image");
    expect(created?.data).toMatchObject({
      generationMode: "panorama_360",
      modelId: "gpt-image-2",
      routeKey: "image.gpt-image-2",
      params: expect.objectContaining({
        aspectRatio: "21:9",
        size: "1K",
      }),
    });
    expect(workflowRunnerMocks.runBackendWorkflow).toHaveBeenCalledWith({
      runMode: "target_node",
      targetNodeId: created?.id,
    });
  });

  it("prepares and selects a nine-grid node without starting generation", async () => {
    assetApiMocks.getAssetSignedUrls.mockResolvedValue({
      items: [{
        assetId: "asset-nine-grid-source",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        method: "GET",
        requestedVariantKey: "thumb",
        servedVariantKey: "thumb",
        status: "ok",
        url: "https://cdn.test/nine-grid-source-thumb.webp",
        variantKey: "thumb",
      }],
    });
    const source = useFlowCanvasStore.getState().addNode(
      "image",
      { x: 0, y: 0 },
      {
        assetId: "asset-nine-grid-source",
        createdAt: 1,
        generationStatus: "done",
        height: 240,
        kind: "image",
        modelId: "gpt-image-2",
        naturalHeight: 1600,
        naturalWidth: 900,
        params: {
          quality: "medium",
          size: "2k",
        },
        routeKey: "image.gpt-image-2",
        status: "success",
        thumbnailUrl: "https://cdn.test/nine-grid-source.png",
        title: "Nine-grid Source",
        updatedAt: 1,
        width: 260,
      } as any,
      { selected: true },
    );

    render(
      <ImageNodeComponent
        id={source.id}
        selected
        data={source.data as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="image"
        xPos={0}
        yPos={0}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "九宫格工具" }));
    fireEvent.click(await screen.findByRole("button", { name: /多机位九宫格/i }));

    await waitFor(() => {
      const state = useFlowCanvasStore.getState();
      const target = state.nodes.find((node) => node.id !== source.id);
      expect(target?.selected).toBe(true);
      expect(state.edges.some((edge) => edge.source === source.id && edge.target === target?.id)).toBe(true);
      expect(target?.data).toMatchObject({
        generationStatus: "idle",
        modelId: "gpt-image-2",
        params: expect.objectContaining({
          aspectRatio: "9:16",
          quality: "medium",
          size: "2k",
        }),
        routeKey: "image.gpt-image-2",
        status: "idle",
      });
    });

    expect(workflowRunnerMocks.runBackendWorkflow).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
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

  it("does not insert a prompt mention when picking a recent asset from the add-reference picker", () => {
    useAssetLibraryMock.mockReturnValue({
      assets: [{
        createdAt: "2026-07-04T00:00:00.000Z",
        id: "asset-picker-1",
        kind: "image",
        originalFilename: "library-cat.png",
        previewUrl: "https://cdn.test/library-cat.png",
        title: "Library Cat",
        updatedAt: "2026-07-04T00:00:00.000Z",
      }],
      error: null,
      favoriteOnly: false,
      folders: [],
      groupedAssets: [],
      loading: false,
      mediaCounts: { all: 1, audio: 0, image: 1, video: 0 },
      page: 1,
      pageSize: 30,
      query: "",
      refresh: vi.fn(async () => undefined),
      selectedFolderId: null,
      selectedMediaTab: "image",
      setFavoriteOnly: vi.fn(),
      setQuery: vi.fn(),
      setSelectedFolderId: vi.fn(),
      setSelectedMediaTab: vi.fn(),
      total: 1,
      updateAssetOptimistically: vi.fn(),
    });
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

    fireEvent.click(screen.getByTitle("添加参考图"));
    fireEvent.click(screen.getByRole("button", { name: /Library Cat/ }));

    expect(useFlowCanvasStore.getState().nodes[0]?.data).toMatchObject({
      generationPrompt: "",
      referenceAssetItemIds: ["asset-picker-1"],
    });
  });

  it("does not insert a prompt mention when picking a canvas image from the add-reference picker", () => {
    const source = useFlowCanvasStore.getState().addNode(
      "image",
      { x: 0, y: 0 },
      {
        createdAt: 1,
        generationStatus: "done",
        height: 170,
        kind: "image",
        status: "success",
        thumbnailUrl: "https://cdn.test/canvas-source.png",
        title: "Canvas Source",
        updatedAt: 2,
        width: 170,
      } as any,
    );
    const target = useFlowCanvasStore.getState().addNode(
      "image",
      { x: 240, y: 0 },
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

    render(
      <ImageNodeComponent
        id={target.id}
        selected
        data={target.data as any}
        dragging={false}
        zIndex={1}
        isConnectable
        type="image"
        xPos={0}
        yPos={0}
      />,
    );

    fireEvent.click(screen.getByTitle("添加参考图"));
    fireEvent.click(screen.getByRole("button", { name: /Canvas Source/ }));

    const nextTarget = useFlowCanvasStore.getState().nodes.find((item) => item.id === target.id);
    expect(nextTarget?.data.generationPrompt).toBe("");
    expect(useFlowCanvasStore.getState().edges).toEqual([
      expect.objectContaining({
        source: source.id,
        target: target.id,
      }),
    ]);
  });

  it("blocks production image modes when the selected route has no active pricing", () => {
    const node = useFlowCanvasStore.getState().addNode(
      "image",
      { x: 0, y: 0 },
      {
        createdAt: 1,
        generationMode: "panorama_360",
        generationPrompt: "鏈潵鍩庡競涓涵鍏ㄦ櫙",
        generationStatus: "idle",
        height: 220,
        kind: "image",
        modelId: "gpt-image-2",
        params: {
          generationMode: "panorama_360",
          panorama: {
            continuity: "seamless",
            projectionHint: "equirectangular",
            subjectType: "scene",
          },
          size: "1k",
        },
        routeKey: "image.gpt-image-2",
        status: "idle",
        title: "Panorama",
        updatedAt: 1,
        width: 320,
      } as any,
      { selected: true },
    );

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

    expect(screen.getByTestId("image-generate-toolbar-credits").textContent).toContain("未配置");

    fireEvent.click(screen.getByRole("button", { name: "开始生成" }));

    expect(workflowRunnerMocks.runBackendWorkflow).not.toHaveBeenCalled();
    expect(useFlowCanvasStore.getState().nodes[0]?.data).toMatchObject({
      generationStatus: "error",
      status: "error",
    });
    expect(String(useFlowCanvasStore.getState().nodes[0]?.data.errorMessage)).toContain("PRICING_NOT_FOUND");
  });
});
