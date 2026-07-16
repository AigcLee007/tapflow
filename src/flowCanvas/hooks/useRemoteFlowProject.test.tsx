import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FlowDraft } from "../services/flowProjectApi";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { useRemoteFlowProject } from "./useRemoteFlowProject";

const getProjectMock = vi.fn();
const listProjectFlowsMock = vi.fn();
const getFlowDraftMock = vi.fn();
const recoverFlowTargetNodeRunsMock = vi.fn();

vi.mock("../services/flowProjectApi", async () => {
  const actual = await vi.importActual<typeof import("../services/flowProjectApi")>("../services/flowProjectApi");
  return {
    ...actual,
    getProject: (...args: unknown[]) => getProjectMock(...args),
    listProjectFlows: (...args: unknown[]) => listProjectFlowsMock(...args),
    getFlowDraft: (...args: unknown[]) => getFlowDraftMock(...args),
  };
});

vi.mock("../runtime/v2WorkflowRunner", () => ({
  recoverFlowTargetNodeRuns: (...args: unknown[]) => recoverFlowTargetNodeRunsMock(...args),
}));

function createLegacyDraft(): FlowDraft {
  return {
    createdAt: "2026-07-16T00:00:00.000Z",
    flowId: "flow-1",
    graph: {
      edges: [],
      nodes: [
        {
          id: "video-1",
          position: { x: 100, y: 120 },
          type: "video",
          data: {
            aspect_ratio: "21:9",
            batchCount: 2,
            duration: "6",
            modelId: "veo3.1-4k",
            quality: "4k cinematic",
            referenceAssetItemIds: ["asset-first", "asset-last"],
            referenceOrder: ["first", "last"],
            routeKey: "video.route-1",
          },
        },
        {
          id: "text-1",
          position: { x: 0, y: 0 },
          type: "text",
          data: { batchCount: 2, params: { aspect_ratio: "21:9" }, title: "Unchanged" },
        },
      ],
      projectStudios: { director3d: { version: 1 } } as never,
      viewport: { x: 12, y: -24, zoom: 0.8 },
    },
    id: "draft-1",
    lastSavedBy: "user-1",
    projectId: "project-1",
    revision: 4,
    tenantId: "tenant-1",
    updatedAt: "2026-07-16T00:00:01.000Z",
  };
}

function mockRemoteDraft(draft: FlowDraft) {
  getProjectMock.mockResolvedValue({ id: "project-1", name: "Project 1" });
  listProjectFlowsMock.mockResolvedValue([{ id: "flow-1", currentVersionId: null }]);
  getFlowDraftMock.mockResolvedValue(draft);
}

describe("useRemoteFlowProject", () => {
  beforeEach(() => {
    window.localStorage.clear();
    getProjectMock.mockReset();
    listProjectFlowsMock.mockReset();
    getFlowDraftMock.mockReset();
    recoverFlowTargetNodeRunsMock.mockReset();
    useFlowCanvasStore.getState().newProject();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("loads legacy video drafts into the store in canonical form without changing non-video nodes", async () => {
    mockRemoteDraft(createLegacyDraft());

    const { result } = renderHook(() => useRemoteFlowProject("project-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const [videoNode, textNode] = useFlowCanvasStore.getState().nodes;
    expect(videoNode?.data).toMatchObject({
      modelId: "veo3.1-fast-4K",
      routeKey: "video.route-1",
      referenceAssetItemIds: ["asset-first", "asset-last"],
      referenceOrder: ["first", "last"],
      params: {
        videoGeneration: expect.objectContaining({
          aspectRatio: "21:9",
          durationSeconds: 6,
          resolution: "4K",
        }),
      },
    });
    expect(videoNode?.data).not.toHaveProperty("aspect_ratio");
    expect(videoNode?.data).not.toHaveProperty("batchCount");
    expect(videoNode?.data).not.toHaveProperty("duration");
    expect(videoNode?.data).not.toHaveProperty("quality");
    expect(textNode?.data).toEqual({ batchCount: 2, params: { aspect_ratio: "21:9" }, title: "Unchanged" });
    expect(useFlowCanvasStore.getState().viewport).toEqual({ x: 12, y: -24, zoom: 0.8 });
    expect(useFlowCanvasStore.getState().projectStudios).toEqual({ director3d: { version: 1 } });
  });

});
