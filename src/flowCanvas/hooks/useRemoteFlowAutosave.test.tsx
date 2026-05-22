import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V2HttpError } from "../../services/v2HttpClient";
import type { FlowDraft } from "../services/flowProjectApi";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
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
    updatedAt: `2026-05-22T00:00:0${revision}.000Z`,
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
  });
}

describe("useRemoteFlowAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveFlowDraftMock.mockReset();
    getFlowDraftMock.mockReset();
    loadStoreFromDraft(createDraft(1));
  });

  afterEach(() => {
    vi.useRealTimers();
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

    await advanceTimers(1199);
    expect(saveFlowDraftMock).not.toHaveBeenCalled();

    await advanceTimers(1);
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

  it("fetches the latest draft revision after a 409 and retries once without surfacing a fatal error", async () => {
    const recoveredDraft = createDraft(8, ["node-a"]);
    const initialDraft = createDraft(1);

    saveFlowDraftMock
      .mockRejectedValueOnce(
        new V2HttpError({
          code: "FLOW_DRAFT_REVISION_CONFLICT",
          message: "revision conflict",
          status: 409,
        }),
      )
      .mockResolvedValueOnce(recoveredDraft);
    getFlowDraftMock.mockResolvedValueOnce(createDraft(7));

    const { result } = renderHook(() =>
      useRemoteFlowAutosave({
        draft: initialDraft,
        enabled: true,
        flowId: "flow-1",
      }),
    );

    act(() => {
      setNodeIds(["node-a"]);
    });

    await advanceTimers(1200);

    await flushPromises();

    expect(saveFlowDraftMock).toHaveBeenCalledTimes(2);
    expect(getFlowDraftMock).toHaveBeenCalledTimes(1);
    expect(saveFlowDraftMock.mock.calls[0]?.[1]).toMatchObject({
      expectedRevision: 1,
    });
    expect(saveFlowDraftMock.mock.calls[1]?.[1]).toMatchObject({
      expectedRevision: 7,
      graph: { nodes: [{ id: "node-a" }] },
    });
    expect(result.current.status).toBe("saved");
    expect(result.current.error).toBeNull();
  });
});
