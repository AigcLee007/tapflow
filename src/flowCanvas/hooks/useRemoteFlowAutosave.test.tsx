import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V2HttpError } from "../../services/v2HttpClient";
import type { FlowDraft } from "../services/flowProjectApi";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { hashGraph } from "../utils/canonicalGraph";
import { useRemoteFlowAutosave } from "./useRemoteFlowAutosave";

const saveFlowDraftMock = vi.fn();
const getFlowDraftMock = vi.fn();

vi.mock("../services/flowProjectApi", async () => {
  const actual =
    await vi.importActual<typeof import("../services/flowProjectApi")>("../services/flowProjectApi");
  return {
    ...actual,
    getFlowDraft: (...args: unknown[]) => getFlowDraftMock(...args),
    saveFlowDraft: (...args: unknown[]) => saveFlowDraftMock(...args),
  };
});

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
