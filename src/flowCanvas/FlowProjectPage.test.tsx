import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { FlowProjectPage } from "./FlowProjectPage";

const useRemoteFlowProjectMock = vi.fn();
const useRemoteFlowAutosaveMock = vi.fn();
const getAssetMock = vi.fn();
const getPromptMock = vi.fn();
const getImageNaturalSizeMock = vi.fn();
const addNodeMock = vi.fn();
const updateNodeDataMock = vi.fn();

vi.mock("./FlowCanvasPage", () => ({
  default: ({ saveStatus }: { saveStatus: { label: string } }) => (
    <div>
      <div data-testid="flow-canvas-page" />
      <div>{saveStatus.label}</div>
    </div>
  ),
}));

vi.mock("./hooks/useRemoteFlowProject", () => ({
  useRemoteFlowProject: () => useRemoteFlowProjectMock(),
}));

vi.mock("./hooks/useRemoteFlowAutosave", () => ({
  useRemoteFlowAutosave: () => useRemoteFlowAutosaveMock(),
}));

vi.mock("./runtime/remoteDraftSaveBarrier", () => ({
  registerRemoteDraftSaveBarrier: vi.fn(() => undefined),
}));

vi.mock("../assets/assetApi", () => ({
  getAsset: (...args: unknown[]) => getAssetMock(...args),
}));

vi.mock("../services/v2PromptsApi", () => ({
  getPrompt: (...args: unknown[]) => getPromptMock(...args),
}));

vi.mock("./utils/imageUtils", () => ({
  getImageNaturalSize: (...args: unknown[]) => getImageNaturalSizeMock(...args),
}));

vi.mock("./store/flowCanvasStore", () => ({
  useFlowCanvasStore: (
    selector: (state: {
      addNode: typeof addNodeMock;
      nodes: Array<{ id: string }>;
      updateNodeData: typeof updateNodeDataMock;
      viewport: { x: number; y: number; zoom: number };
    }) => unknown,
  ) =>
    selector({
      addNode: addNodeMock,
      nodes: [],
      updateNodeData: updateNodeDataMock,
      viewport: { x: 0, y: 0, zoom: 1 },
    }),
}));

function setProjectPath(path: string) {
  window.history.replaceState(null, "", path);
}

describe("FlowProjectPage", () => {
  beforeEach(() => {
    setProjectPath("/projects/project-1");
    getAssetMock.mockReset();
    getPromptMock.mockReset();
    getImageNaturalSizeMock.mockReset();
    addNodeMock.mockReset();
    updateNodeDataMock.mockReset();
    addNodeMock.mockReturnValue({ id: "inserted-node-1" });
    useRemoteFlowAutosaveMock.mockReturnValue({
      error: null,
      saveNow: vi.fn(async () => undefined),
      status: "saved",
    });
  });

  test("renders loading state", () => {
    useRemoteFlowProjectMock.mockReturnValue({
      draft: null,
      error: null,
      flow: null,
      loading: true,
      reload: vi.fn(),
    });

    render(<FlowProjectPage />);

    expect(screen.getByText("正在打开项目画布...")).toBeTruthy();
    expect(screen.getByTestId("brand-transition").getAttribute("data-variant")).toBe("canvas");
  });

  test("renders error state", () => {
    useRemoteFlowProjectMock.mockReturnValue({
      draft: null,
      error: "项目不存在",
      flow: null,
      loading: false,
      reload: vi.fn(),
    });

    render(<FlowProjectPage />);

    expect(screen.getByText("项目画布打开失败")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新加载" })).toBeTruthy();
  });

  test("passes save status into the canvas page", () => {
    useRemoteFlowProjectMock.mockReturnValue({
      draft: null,
      error: null,
      flow: { id: "flow-1" },
      loading: false,
      reload: vi.fn(),
    });

    render(<FlowProjectPage />);

    expect(screen.getByTestId("flow-canvas-page")).toBeTruthy();
    expect(screen.getByText("已保存到云端")).toBeTruthy();
  });

  test("repairs portrait asset sizing when inserted from insertAssetId route", async () => {
    setProjectPath("/projects/project-1?insertAssetId=asset-portrait");
    useRemoteFlowProjectMock.mockReturnValue({
      draft: null,
      error: null,
      flow: { id: "flow-1" },
      loading: false,
      reload: vi.fn(),
    });
    getAssetMock.mockResolvedValue({
      durationMs: null,
      height: 1024,
      id: "asset-portrait",
      kind: "image",
      mimeType: "image/png",
      originalFilename: "portrait.png",
      previewUrl: "https://cdn.test/portrait-preview.png",
      source: "asset-library",
      title: "Portrait",
      width: 1024,
    });
    getImageNaturalSizeMock.mockResolvedValue({ h: 1600, w: 900 });

    render(<FlowProjectPage />);

    await waitFor(() => {
      expect(addNodeMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(updateNodeDataMock).toHaveBeenCalledWith("inserted-node-1", {
        aspectRatio: 900 / 1600,
        height: 302,
        naturalHeight: 1600,
        naturalWidth: 900,
        width: 170,
      });
    });
  });

  test("inserts a new image node from a prompt reference request", async () => {
    setProjectPath("/projects/project-1?insertPromptId=prompt-1&promptInsertRequestId=request-1");
    useRemoteFlowProjectMock.mockReturnValue({
      draft: null,
      error: null,
      flow: { id: "flow-1" },
      loading: false,
      reload: vi.fn(),
    });
    getPromptMock.mockResolvedValue({
      id: "prompt-1",
      promptText: "cinematic portrait",
      title: "Portrait",
    });

    render(<FlowProjectPage />);

    await waitFor(() => {
      expect(addNodeMock).toHaveBeenCalledWith(
        "image",
        expect.any(Object),
        expect.objectContaining({
          generationPrompt: "cinematic portrait",
          sourcePromptId: "prompt-1",
          sourcePromptInsertRequestId: "request-1",
          sourcePromptTitle: "Portrait",
        }),
        { selected: true },
      );
    });
    expect(window.location.search).not.toContain("insertPromptId");
  });
});
