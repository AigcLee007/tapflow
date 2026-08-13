import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V2HttpError } from "../../services/v2HttpClient";
import type { FlowDraft } from "../services/flowProjectApi";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { hashGraph } from "../utils/canonicalGraph";
import { useRemoteFlowAutosave } from "./useRemoteFlowAutosave";
import { useRemoteFlowProject } from "./useRemoteFlowProject";

const saveFlowDraftMock = vi.fn();
const getFlowDraftMock = vi.fn();
const getProjectMock = vi.fn();
const listProjectFlowsMock = vi.fn();
const recoverFlowTargetNodeRunsMock = vi.fn();

vi.mock("../services/flowProjectApi", async () => {
  const actual =
    await vi.importActual<typeof import("../services/flowProjectApi")>("../services/flowProjectApi");
  return {
    ...actual,
    getProject: (...args: unknown[]) => getProjectMock(...args),
    getFlowDraft: (...args: unknown[]) => getFlowDraftMock(...args),
    listProjectFlows: (...args: unknown[]) => listProjectFlowsMock(...args),
    saveFlowDraft: (...args: unknown[]) => saveFlowDraftMock(...args),
  };
});

vi.mock("../runtime/v2WorkflowRunner", () => ({
  recoverFlowTargetNodeRuns: (...args: unknown[]) => recoverFlowTargetNodeRunsMock(...args),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

function createConflictError() {
  return new V2HttpError({
    code: "FLOW_DRAFT_REVISION_CONFLICT",
    message: "revision conflict",
    status: 409,
  });
}

function createDraft(revision: number, nodeIds: string[] = []): FlowDraft {
  const nodes = nodeIds.map((id) => ({
    id,
    position: { x: 0, y: 0 },
    data: { title: id },
    type: "text",
  }));

  return {
    createdAt: "2026-05-22T00:00:00.000Z",
    flowId: "flow-1",
    graph: {
      edges: [],
      nodes,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    id: "draft-1",
    lastSavedBy: "user-1",
    projectId: "project-1",
    revision,
    tenantId: "tenant-1",
    updatedAt: `2026-05-22T00:00:${String(revision).padStart(2, "0")}.000Z`,
  };
}

function loadStoreFromDraft(draft: FlowDraft) {
  useFlowCanvasStore.getState().loadProject({
    id: draft.projectId,
    title: "Project 1",
    nodes: draft.graph.nodes as never[],
    edges: draft.graph.edges as never[],
    viewport: draft.graph.viewport,
    version: draft.revision,
    updatedAt: Date.parse(draft.updatedAt),
    backendProjectId: draft.projectId,
    backendFlowId: draft.flowId,
    backendCurrentVersionId: null,
  });
}

function setNodeIds(nodeIds: string[]) {
  useFlowCanvasStore.setState({
    nodes: nodeIds.map((id) => ({
      id,
      position: { x: 0, y: 0 },
      data: { title: id },
      type: "text",
    })) as never[],
    isDirty: true,
  });
}

async function advanceTimers(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useRemoteFlowAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    saveFlowDraftMock.mockReset();
    getFlowDraftMock.mockReset();
    getProjectMock.mockReset();
    listProjectFlowsMock.mockReset();
    recoverFlowTargetNodeRunsMock.mockReset();
    loadStoreFromDraft(createDraft(1));
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("serializes saves and reuses the latest server revision for follow-up changes", async () => {
    const firstSave = deferred<FlowDraft>();
    const secondSave = deferred<FlowDraft>();
    const initialDraft = createDraft(1);

    saveFlowDraftMock
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);

    renderHook(() =>
      useRemoteFlowAutosave({
        draft: initialDraft,
        enabled: true,
        flowId: "flow-1",
      }),
    );

    act(() => {
      setNodeIds(["node-a"]);
    });

    await advanceTimers(800);
    act(() => {
      setNodeIds(["node-a", "node-b"]);
    });

    await advanceTimers(1200);
    expect(saveFlowDraftMock).toHaveBeenCalledTimes(1);
    expect(saveFlowDraftMock.mock.calls[0]?.[1]).toMatchObject({
      expectedRevision: 1,
      graph: { nodes: [{ id: "node-a" }, { id: "node-b" }] },
    });

    act(() => {
      setNodeIds(["node-a", "node-b", "node-c"]);
    });

    await advanceTimers(1500);
    expect(saveFlowDraftMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstSave.resolve(createDraft(2, ["node-a", "node-b"]));
      await Promise.resolve();
    });
    await flushPromises();

    expect(saveFlowDraftMock).toHaveBeenCalledTimes(2);
    expect(saveFlowDraftMock.mock.calls[1]?.[1]).toMatchObject({
      expectedRevision: 2,
      graph: { nodes: [{ id: "node-a" }, { id: "node-b" }, { id: "node-c" }] },
    });

    await act(async () => {
      secondSave.resolve(createDraft(3, ["node-a", "node-b", "node-c"]));
      await Promise.resolve();
    });
  });

  it("uses only the latest revision after a 409 and never overwrites the local graph with the server graph", async () => {
    const initialDraft = createDraft(1);

    saveFlowDraftMock
      .mockRejectedValueOnce(createConflictError())
      .mockResolvedValueOnce(createDraft(8, ["local-a"]));
    getFlowDraftMock.mockResolvedValueOnce(createDraft(7, ["server-a", "server-b"]));

    const { result } = renderHook(() =>
      useRemoteFlowAutosave({
        draft: initialDraft,
        enabled: true,
        flowId: "flow-1",
      }),
    );

    act(() => {
      setNodeIds(["local-a"]);
    });

    await advanceTimers(1200);
    await flushPromises();
    expect(saveFlowDraftMock).toHaveBeenCalledTimes(1);

    await advanceTimers(150);
    await flushPromises();

    expect(getFlowDraftMock).toHaveBeenCalledTimes(1);
    expect(saveFlowDraftMock).toHaveBeenCalledTimes(2);
    expect(saveFlowDraftMock.mock.calls[1]?.[1]).toMatchObject({
      expectedRevision: 7,
      graph: { nodes: [{ id: "local-a" }] },
    });
    expect(saveFlowDraftMock.mock.calls[1]?.[1].graph).not.toEqual(createDraft(7, ["server-a", "server-b"]).graph);
    expect(result.current.status).toBe("saved");
    expect(result.current.error).toBeNull();
  });

  it("retries conflict saves up to the retry budget and keeps using the newest local graph while retrying", async () => {
    const initialDraft = createDraft(1);

    saveFlowDraftMock
      .mockRejectedValueOnce(createConflictError())
      .mockRejectedValueOnce(createConflictError())
      .mockResolvedValueOnce(createDraft(12, ["local-a", "local-b"]));
    getFlowDraftMock
      .mockResolvedValueOnce(createDraft(10, ["server-a"]))
      .mockResolvedValueOnce(createDraft(11, ["server-b"]));

    const { result } = renderHook(() =>
      useRemoteFlowAutosave({
        draft: initialDraft,
        enabled: true,
        flowId: "flow-1",
      }),
    );

    act(() => {
      setNodeIds(["local-a"]);
    });

    await advanceTimers(1200);
    await flushPromises();

    expect(result.current.status).toBe("retrying");

    act(() => {
      setNodeIds(["local-a", "local-b"]);
    });

    await advanceTimers(150);
    await flushPromises();
    expect(saveFlowDraftMock).toHaveBeenCalledTimes(2);
    expect(saveFlowDraftMock.mock.calls[1]?.[1]).toMatchObject({
      expectedRevision: 10,
      graph: { nodes: [{ id: "local-a" }, { id: "local-b" }] },
    });

    await advanceTimers(300);
    await flushPromises();

    expect(saveFlowDraftMock).toHaveBeenCalledTimes(3);
    expect(saveFlowDraftMock.mock.calls[2]?.[1]).toMatchObject({
      expectedRevision: 11,
      graph: { nodes: [{ id: "local-a" }, { id: "local-b" }] },
    });
    expect(result.current.status).toBe("saved");
    expect(result.current.error).toBeNull();
  });

  it("keeps editing nonblocking after retry exhaustion and saves again on the next user change", async () => {
    const initialDraft = createDraft(1);

    saveFlowDraftMock
      .mockRejectedValueOnce(createConflictError())
      .mockRejectedValueOnce(createConflictError())
      .mockRejectedValueOnce(createConflictError())
      .mockResolvedValueOnce(createDraft(15, ["local-a", "local-b"]));
    getFlowDraftMock
      .mockResolvedValueOnce(createDraft(10))
      .mockResolvedValueOnce(createDraft(11))
      .mockResolvedValueOnce(createDraft(14));

    const { result } = renderHook(() =>
      useRemoteFlowAutosave({
        draft: initialDraft,
        enabled: true,
        flowId: "flow-1",
      }),
    );

    act(() => {
      setNodeIds(["local-a"]);
    });

    await advanceTimers(1200);
    await flushPromises();
    await advanceTimers(150);
    await flushPromises();
    await advanceTimers(300);
    await flushPromises();

    expect(saveFlowDraftMock).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe("failed");
    expect(result.current.error).toContain("你可以继续编辑");

    act(() => {
      setNodeIds(["local-a", "local-b"]);
    });

    await advanceTimers(1200);
    await flushPromises();

    expect(saveFlowDraftMock).toHaveBeenCalledTimes(4);
    expect(saveFlowDraftMock.mock.calls[3]?.[1]).toMatchObject({
      expectedRevision: 14,
      graph: { nodes: [{ id: "local-a" }, { id: "local-b" }] },
    });
    expect(result.current.status).toBe("saved");
  });

  it("ignores runtime fields and expiring signed URLs when hashing the canonical graph", () => {
    const base = {
      edges: [],
      nodes: [
        {
          id: "image-a",
          position: { x: 1, y: 2 },
          type: "image",
          selected: false,
          data: {
            assetId: "asset-a",
            generationPrompt: "hello",
            progress: 0,
            status: "pending",
            thumbnailUrl: "https://cdn.test/a.png?X-Amz-Signature=one",
            updatedAt: 1,
          },
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const runtimeOnlyChanged = {
      ...base,
      nodes: [
        {
          ...base.nodes[0],
          selected: true,
          data: {
            ...base.nodes[0].data,
            progress: 67,
            status: "running",
            thumbnailUrl: "https://cdn.test/a.png?X-Amz-Signature=two",
            updatedAt: 2,
          },
        },
      ],
    };

    expect(hashGraph(base)).toBe(hashGraph(runtimeOnlyChanged));
  });

  it("does not enqueue cloud sync for runtime-only node changes", async () => {
    const initialDraft = createDraft(1);
    initialDraft.graph.nodes = [
      {
        id: "image-a",
        position: { x: 0, y: 0 },
        type: "image",
        data: {
          assetId: "asset-a",
          generationPrompt: "hello",
          thumbnailUrl: "https://cdn.test/a.png?X-Amz-Signature=one",
        },
      },
    ];
    loadStoreFromDraft(initialDraft);

    renderHook(() =>
      useRemoteFlowAutosave({
        draft: initialDraft,
        enabled: true,
        flowId: "flow-1",
      }),
    );

    act(() => {
      useFlowCanvasStore.setState({
        nodes: [
          {
            id: "image-a",
            position: { x: 0, y: 0 },
            type: "image",
            data: {
              assetId: "asset-a",
              generationPrompt: "hello",
              progress: 90,
              status: "running",
              thumbnailUrl: "https://cdn.test/a.png?X-Amz-Signature=two",
              updatedAt: Date.now(),
            },
          },
        ] as never[],
      });
    });

    await advanceTimers(1500);
    expect(saveFlowDraftMock).not.toHaveBeenCalled();
  });

  it("persists the full video generation contract through autosave", async () => {
    const initialDraft = createDraft(1);
    saveFlowDraftMock.mockImplementationOnce(async (_flowId, input) => ({
      ...initialDraft,
      graph: input.graph,
      revision: 2,
      updatedAt: "2026-05-22T00:00:02.000Z",
    }));

    renderHook(() =>
      useRemoteFlowAutosave({
        draft: initialDraft,
        enabled: true,
        flowId: "flow-1",
      }),
    );

    act(() => {
      useFlowCanvasStore.setState({
        nodes: [
          {
            id: "video-1",
            position: { x: 0, y: 0 },
            type: "video",
            data: {
              modelId: "veo3.1-fast-4K",
              routeKey: "video.default",
              params: {
                videoGeneration: {
                  schemaVersion: 2,
                  mode: "text_to_video",
                  aspectRatio: "16:9",
                  resolution: "4K",
                  durationSeconds: 8,
                  generateAudio: true,
                  count: 1,
                  cameraMotionId: "dolly-in",
                  visualTone: "cinematic_teal",
                  contextPaletteRefs: [],
                  humanReview: { status: "not_required" },
                  localBlob: new Blob(["preview"], { type: "image/webp" }),
                  localFile: new File(["preview"], "preview.webp", { type: "image/webp" }),
                  relativeSignedPreview: "/assets/video.webp?X-Amz-Signature=secret",
                  referenceRolesByKey: {},
                },
              },
            },
          },
        ] as never[],
        isDirty: true,
      });
    });

    await advanceTimers(1200);
    await flushPromises();

    expect(saveFlowDraftMock).toHaveBeenCalledTimes(1);
    expect(saveFlowDraftMock.mock.calls[0]?.[1]).toMatchObject({
      graph: {
        nodes: [
          {
            id: "video-1",
            data: {
              params: {
                videoGeneration: {
                  schemaVersion: 2,
                  resolution: "4K",
                  durationSeconds: 8,
                  generateAudio: true,
                  count: 1,
                },
              },
            },
          },
        ],
      },
    });
    const savedVideoParams = saveFlowDraftMock.mock.calls[0]?.[1].graph.nodes[0]?.data
      .params.videoGeneration;
    expect(savedVideoParams).not.toHaveProperty("localBlob");
    expect(savedVideoParams).not.toHaveProperty("localFile");
    expect(savedVideoParams).not.toHaveProperty("relativeSignedPreview");

    act(() => {
      loadStoreFromDraft({
        ...initialDraft,
        graph: saveFlowDraftMock.mock.calls[0]?.[1].graph,
        revision: 2,
        updatedAt: "2026-05-22T00:00:02.000Z",
      });
    });
    const restoredVideoParams = useFlowCanvasStore.getState().nodes[0]?.data.params
      ?.videoGeneration as Record<string, unknown>;
    expect(restoredVideoParams).toMatchObject({
      schemaVersion: 2,
      resolution: "4K",
      durationSeconds: 8,
      generateAudio: true,
      count: 1,
    });
    expect(restoredVideoParams).not.toHaveProperty("localBlob");
    expect(restoredVideoParams).not.toHaveProperty("localFile");
    expect(restoredVideoParams).not.toHaveProperty("relativeSignedPreview");
  });

  it("migrates legacy video params before autosave and reloads the canonical contract", async () => {
    const initialDraft = createDraft(1);
    saveFlowDraftMock.mockImplementationOnce(async (_flowId, input) => ({
      ...initialDraft,
      graph: input.graph,
      revision: 2,
      updatedAt: "2026-05-22T00:00:02.000Z",
    }));

    renderHook(() =>
      useRemoteFlowAutosave({
        draft: initialDraft,
        enabled: true,
        flowId: "flow-1",
      }),
    );

    act(() => {
      useFlowCanvasStore.setState({
        nodes: [
          {
            id: "video-legacy",
            position: { x: 0, y: 0 },
            type: "video",
            data: {
              modelId: "veo3.1-4k",
              routeKey: "video.custom-route",
              referenceAssetItemIds: ["asset-first", "asset-last"],
              referenceOrder: ["first", "last"],
              batchCount: 3,
              params: {
                aspect_ratio: "21:9",
                duration: "6",
                quality: "4k cinematic",
                hd: true,
                n: 3,
                referenceLabels: ["First Frame", "Last Frame"],
                localPreview: new Blob(["preview"], { type: "image/webp" }),
                previewUrl: "blob:http://localhost/video-preview",
              },
            },
          },
        ] as never[],
        isDirty: true,
      });
    });

    await advanceTimers(1200);
    await flushPromises();

    const savedVideo = saveFlowDraftMock.mock.calls[0]?.[1].graph.nodes[0];
    expect(savedVideo?.data).toMatchObject({
      modelId: "veo3.1-fast-4K",
      routeKey: "video.custom-route",
      referenceAssetItemIds: ["asset-first", "asset-last"],
      referenceOrder: ["first", "last"],
      params: {
        videoGeneration: {
          schemaVersion: 2,
          mode: "first_last_frame",
          aspectRatio: "21:9",
          resolution: "4K",
          durationSeconds: 6,
          count: 1,
        },
      },
    });
    expect(JSON.stringify(savedVideo)).not.toMatch(/blob:|previewUrl|localPreview/);
    expect(savedVideo?.data).not.toHaveProperty("batchCount");

    act(() => {
      loadStoreFromDraft({
        ...initialDraft,
        graph: saveFlowDraftMock.mock.calls[0]?.[1].graph,
        revision: 2,
        updatedAt: "2026-05-22T00:00:02.000Z",
      });
    });

    const restoredData = useFlowCanvasStore.getState().nodes[0]?.data;
    expect(restoredData).toMatchObject({
      modelId: "veo3.1-fast-4K",
      routeKey: "video.custom-route",
      params: {
        videoGeneration: {
          schemaVersion: 2,
          mode: "first_last_frame",
          aspectRatio: "21:9",
          resolution: "4K",
          durationSeconds: 6,
          count: 1,
        },
      },
    });
    expect(restoredData?.params).not.toHaveProperty("aspect_ratio");
    expect(restoredData?.params).not.toHaveProperty("referenceLabels");
    expect(restoredData).not.toHaveProperty("batchCount");
  });

  it("saveNow flushes the latest store graph even before the hook observes the new node", async () => {
    const initialDraft = createDraft(1, ["source-image"]);
    loadStoreFromDraft(initialDraft);
    const savedDraft = createDraft(2, ["source-image", "target-image"]);
    saveFlowDraftMock.mockResolvedValueOnce(savedDraft);

    const { result } = renderHook(() =>
      useRemoteFlowAutosave({
        draft: initialDraft,
        enabled: true,
        flowId: "flow-1",
      }),
    );

    act(() => {
      useFlowCanvasStore.setState((state) => ({
        edges: [
          ...state.edges,
          {
            id: "edge-source-target",
            source: "source-image",
            target: "target-image",
            type: "smart",
          },
        ] as never[],
        nodes: [
          ...state.nodes,
          {
            id: "target-image",
            position: { x: 120, y: 0 },
            type: "image",
            data: {
              generationPrompt: "show a new angle",
              generationStatus: "generating",
              routeKey: "image.nano-banana-pro",
              status: "running",
              title: "多角度后的1",
            },
          },
        ] as never[],
        isDirty: true,
      }));
    });

    await act(async () => {
      await result.current.saveNow();
    });

    expect(saveFlowDraftMock).toHaveBeenCalledTimes(1);
    expect(saveFlowDraftMock.mock.calls[0]?.[1]).toMatchObject({
      graph: {
        edges: [
          expect.objectContaining({
            source: "source-image",
            target: "target-image",
          }),
        ],
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: "source-image" }),
          expect.objectContaining({
            data: expect.objectContaining({
              generationPrompt: "show a new angle",
              routeKey: "image.nano-banana-pro",
              title: "多角度后的1",
            }),
            id: "target-image",
          }),
        ]),
      },
    });
    expect(saveFlowDraftMock.mock.calls[0]?.[1].graph.nodes).toHaveLength(2);
  });

  it("saves the project default director desk outside the canvas nodes", async () => {
    const initialDraft = createDraft(1);
    loadStoreFromDraft(initialDraft);
    saveFlowDraftMock.mockResolvedValueOnce({
      ...initialDraft,
      graph: {
        ...initialDraft.graph,
        projectStudios: {
          director3d: {
            version: 1,
            scene: { gridVisible: true, units: "meters" },
            actors: [
              {
                id: "actor-1",
                kind: "placeholder_humanoid",
                locked: false,
                name: "角色 1",
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                scale: [1, 1, 1],
                visible: true,
              },
            ],
            cameras: [],
            shots: [],
          },
        },
      },
      revision: 2,
      updatedAt: "2026-05-22T00:00:02.000Z",
    });

    renderHook(() =>
      useRemoteFlowAutosave({
        draft: initialDraft,
        enabled: true,
        flowId: "flow-1",
      }),
    );

    act(() => {
      useFlowCanvasStore.getState().updateProjectDirector3d({
        version: 1,
        scene: { gridVisible: true, units: "meters" },
        actors: [
          {
            id: "actor-1",
            kind: "placeholder_humanoid",
            locked: false,
            name: "角色 1",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            visible: true,
          },
        ],
        cameras: [],
        shots: [],
      });
    });

    await advanceTimers(1200);
    await flushPromises();

    expect(saveFlowDraftMock).toHaveBeenCalledTimes(1);
    expect(saveFlowDraftMock.mock.calls[0]?.[1]).toMatchObject({
      graph: {
        nodes: [],
        projectStudios: {
          director3d: {
            actors: [expect.objectContaining({ id: "actor-1", name: "角色 1" })],
          },
        },
      },
    });
  });

  it("saveNow waits for an in-flight autosave and then persists a newly added target node", async () => {
    const firstSave = deferred<FlowDraft>();
    const secondSave = deferred<FlowDraft>();
    const initialDraft = createDraft(1, ["source-image"]);
    loadStoreFromDraft(initialDraft);
    saveFlowDraftMock
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);

    const { result } = renderHook(() =>
      useRemoteFlowAutosave({
        draft: initialDraft,
        enabled: true,
        flowId: "flow-1",
      }),
    );

    act(() => {
      setNodeIds(["source-image", "intermediate-change"]);
    });
    await advanceTimers(1200);
    expect(saveFlowDraftMock).toHaveBeenCalledTimes(1);

    act(() => {
      useFlowCanvasStore.setState((state) => ({
        edges: [
          {
            id: "edge-source-target",
            source: "source-image",
            target: "target-image",
            type: "smart",
          },
        ] as never[],
        nodes: [
          ...state.nodes.filter((node) => node.id === "source-image"),
          {
            id: "target-image",
            position: { x: 120, y: 0 },
            type: "image",
            data: {
              generationPrompt: "relight the source",
              imageEditRequest: {
                editType: "relight",
                sourceNodeId: "source-image",
              },
              routeKey: "image.pixellelabs.nano-banana-pro",
              title: "打光后的1",
            },
          },
        ] as never[],
        isDirty: true,
      }));
    });

    let saveNowSettled = false;
    const saveNowPromise = result.current.saveNow().then(() => {
      saveNowSettled = true;
    });
    await flushPromises();
    expect(saveNowSettled).toBe(false);
    expect(saveFlowDraftMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstSave.resolve(createDraft(2, ["source-image", "intermediate-change"]));
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(saveFlowDraftMock).toHaveBeenCalledTimes(2));

    expect(saveFlowDraftMock.mock.calls[1]?.[1]).toMatchObject({
      graph: {
        edges: [
          expect.objectContaining({
            source: "source-image",
            target: "target-image",
          }),
        ],
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: "source-image" }),
          expect.objectContaining({
            data: expect.objectContaining({
              generationPrompt: "relight the source",
              imageEditRequest: expect.objectContaining({
                editType: "relight",
                sourceNodeId: "source-image",
              }),
              routeKey: "image.pixellelabs.nano-banana-pro",
            }),
            id: "target-image",
          }),
        ]),
      },
    });

    await act(async () => {
      secondSave.resolve(createDraft(3, ["source-image", "target-image"]));
      await saveNowPromise;
    });
    expect(saveNowSettled).toBe(true);
    await flushPromises();
    expect(saveFlowDraftMock).toHaveBeenCalledTimes(2);
  });

  it("multiple saveNow callers waiting on one in-flight autosave share the next flush", async () => {
    const firstSave = deferred<FlowDraft>();
    const secondSave = deferred<FlowDraft>();
    const initialDraft = createDraft(1, ["source-image"]);
    loadStoreFromDraft(initialDraft);
    saveFlowDraftMock
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);

    const { result } = renderHook(() =>
      useRemoteFlowAutosave({
        draft: initialDraft,
        enabled: true,
        flowId: "flow-1",
      }),
    );

    act(() => {
      setNodeIds(["source-image", "intermediate-change"]);
    });
    await advanceTimers(1200);
    expect(saveFlowDraftMock).toHaveBeenCalledTimes(1);

    act(() => {
      setNodeIds(["source-image", "target-image"]);
    });

    let firstSaveNowSettled = false;
    let secondSaveNowSettled = false;
    const firstSaveNow = result.current.saveNow().then(() => {
      firstSaveNowSettled = true;
    });
    const secondSaveNow = result.current.saveNow().then(() => {
      secondSaveNowSettled = true;
    });

    await flushPromises();
    expect(firstSaveNowSettled).toBe(false);
    expect(secondSaveNowSettled).toBe(false);

    await act(async () => {
      firstSave.resolve(createDraft(2, ["source-image", "intermediate-change"]));
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(saveFlowDraftMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      secondSave.resolve(createDraft(3, ["source-image", "target-image"]));
      await Promise.all([firstSaveNow, secondSaveNow]);
    });

    expect(firstSaveNowSettled).toBe(true);
    expect(secondSaveNowSettled).toBe(true);
    await flushPromises();
    expect(saveFlowDraftMock).toHaveBeenCalledTimes(2);
  });

  it("starts from the canonical graph loaded by the remote project hook and preserves it across save and reload", async () => {
    vi.useRealTimers();
    const serverDraft = createDraft(4);
    serverDraft.graph.nodes = [
      {
        id: "video-legacy",
        position: { x: 0, y: 0 },
        type: "video",
        data: {
          aspect_ratio: "21:9",
          duration: "6",
          modelId: "veo3.1-4k",
          quality: "4k cinematic",
          referenceAssetItemIds: ["asset-first", "asset-last"],
          referenceOrder: ["first", "last"],
          routeKey: "video.route-1",
        },
      },
    ];
    getProjectMock.mockResolvedValue({ id: "project-1", name: "Project 1" });
    listProjectFlowsMock.mockResolvedValue([{ id: "flow-1", currentVersionId: null }]);
    getFlowDraftMock.mockResolvedValue(serverDraft);
    saveFlowDraftMock.mockImplementation(async (_flowId: string, input: { graph: FlowDraft["graph"] }) => {
      const savedDraft = {
        ...serverDraft,
        graph: input.graph,
        revision: 5,
        updatedAt: "2026-05-22T00:00:05.000Z",
      };
      getFlowDraftMock.mockResolvedValue(savedDraft);
      return savedDraft;
    });

    const { result } = renderHook(() => {
      const project = useRemoteFlowProject("project-1");
      const autosave = useRemoteFlowAutosave({
        draft: project.draft,
        enabled: !project.loading,
        flowId: project.flow?.id ?? null,
      });
      return { autosave, project };
    });

    await waitFor(() => expect(result.current.project.loading).toBe(false));
    expect(saveFlowDraftMock).not.toHaveBeenCalled();

    act(() => {
      useFlowCanvasStore.getState().updateNodeData("video-legacy", { generationPrompt: "A safe prompt" });
    });
    await act(async () => {
      await result.current.autosave.saveNow();
    });

    const savedVideo = saveFlowDraftMock.mock.calls[0]?.[1].graph.nodes[0];
    expect(savedVideo?.data).toMatchObject({
      modelId: "veo3.1-fast-4K",
      routeKey: "video.route-1",
      params: { videoGeneration: expect.any(Object) },
    });
    expect(JSON.stringify(savedVideo)).not.toMatch(/"aspect_ratio"|"duration"|"quality"|blob:|data:/);

    await act(async () => {
      await result.current.project.reload();
    });
    const reloadedVideo = useFlowCanvasStore.getState().nodes.find((node) => node.id === "video-legacy");
    expect(reloadedVideo?.data).toMatchObject({
      modelId: "veo3.1-fast-4K",
      params: { videoGeneration: expect.any(Object) },
    });
    expect(JSON.stringify(reloadedVideo)).not.toMatch(/"aspect_ratio"|"duration"|"quality"|blob:|data:/);
  });

  it("persists a text node font size change across save and reload", async () => {
    vi.useRealTimers();
    const serverDraft = createDraft(4);
    serverDraft.graph = {
      edges: [],
      nodes: [{
        id: "text-a",
        position: { x: 12, y: 34 },
        width: 320,
        height: 240,
        type: "text",
        data: { fontSize: "body", text: "Existing text" },
      }],
      viewport: { x: 56, y: 78, zoom: 0.9 },
    };
    getProjectMock.mockResolvedValue({ id: "project-1", name: "Project 1" });
    listProjectFlowsMock.mockResolvedValue([{ id: "flow-1", currentVersionId: null }]);
    getFlowDraftMock.mockResolvedValue(serverDraft);
    saveFlowDraftMock.mockImplementation(async (_flowId: string, input: { graph: FlowDraft["graph"] }) => {
      const savedDraft = {
        ...serverDraft,
        graph: input.graph,
        revision: 5,
        updatedAt: "2026-05-22T00:00:05.000Z",
      };
      getFlowDraftMock.mockResolvedValue(savedDraft);
      return savedDraft;
    });

    const { result } = renderHook(() => {
      const project = useRemoteFlowProject("project-1");
      const autosave = useRemoteFlowAutosave({
        draft: project.draft,
        enabled: !project.loading,
        flowId: project.flow?.id ?? null,
      });
      return { autosave, project };
    });

    await waitFor(() => expect(result.current.project.loading).toBe(false));
    act(() => {
      useFlowCanvasStore.getState().updateNodeData("text-a", { fontSize: "h1" });
    });
    await act(async () => {
      await result.current.autosave.saveNow();
    });

    const savedNode = saveFlowDraftMock.mock.calls[0]?.[1].graph.nodes[0];
    expect(savedNode).toMatchObject({
      data: { fontSize: "h1", text: "Existing text" },
      height: 240,
      position: { x: 12, y: 34 },
      width: 320,
    });
    expect(saveFlowDraftMock.mock.calls[0]?.[1].graph.viewport).toEqual({ x: 56, y: 78, zoom: 0.9 });

    await act(async () => {
      await result.current.project.reload();
    });
    expect(useFlowCanvasStore.getState().nodes.find((node) => node.id === "text-a")).toMatchObject({
      data: { fontSize: "h1", text: "Existing text" },
      height: 240,
      position: { x: 12, y: 34 },
      width: 320,
    });
    expect(useFlowCanvasStore.getState().viewport).toEqual({ x: 56, y: 78, zoom: 0.9 });
  });

  it("syncs once when generation completion writes durable output to the target node", async () => {
    const initialDraft = createDraft(1);
    initialDraft.graph.nodes = [
      {
        id: "image-a",
        position: { x: 0, y: 0 },
        type: "image",
        data: {
          generationPrompt: "hello",
        },
      },
    ];
    loadStoreFromDraft(initialDraft);
    saveFlowDraftMock.mockResolvedValueOnce({
      ...initialDraft,
      graph: {
        ...initialDraft.graph,
        nodes: [
          {
            id: "image-a",
            position: { x: 0, y: 0 },
            type: "image",
            data: {
              assetId: "asset-a",
              generationPrompt: "hello",
            },
          },
        ],
      },
      revision: 2,
      updatedAt: "2026-05-22T00:00:02.000Z",
    });

    const { result } = renderHook(() =>
      useRemoteFlowAutosave({
        draft: initialDraft,
        enabled: true,
        flowId: "flow-1",
      }),
    );

    act(() => {
      useFlowCanvasStore.getState().updateNodeData("image-a", {
        assetId: "asset-a",
        progress: 100,
        status: "success",
      } as never);
    });

    await advanceTimers(1200);
    await flushPromises();

    expect(saveFlowDraftMock).toHaveBeenCalledTimes(1);
    expect(saveFlowDraftMock.mock.calls[0]?.[1]).toMatchObject({
      graph: {
        nodes: [
          {
            data: {
              assetId: "asset-a",
              generationPrompt: "hello",
            },
          },
        ],
      },
    });
    expect(result.current.status).toBe("saved");
  });
});
