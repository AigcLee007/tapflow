import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { FlowTopToolbar } from "./FlowTopToolbar";

const createWorkspaceProjectMock = vi.fn();
const updateWorkspaceProjectMock = vi.fn();
const deleteWorkspaceProjectMock = vi.fn();
const setProjectTitleMock = vi.fn();
const createPanoramaTargetNodeFromSourceMock = vi.fn();
const markBackendRunLaunchFailedMock = vi.fn();
const runBackendWorkflowMock = vi.fn();

const mockedStoreState: {
  nodes: Array<Record<string, unknown>>;
  createPanoramaTargetNodeFromSource: typeof createPanoramaTargetNodeFromSourceMock;
  projectTitle: string;
  setProjectTitle: typeof setProjectTitleMock;
} = {
  createPanoramaTargetNodeFromSource: createPanoramaTargetNodeFromSourceMock,
  nodes: [],
  projectTitle: "Test Project",
  setProjectTitle: setProjectTitleMock,
};

vi.mock("../store/flowCanvasStore", () => ({
  useFlowCanvasStore: (selector: (state: typeof mockedStoreState) => unknown) => selector(mockedStoreState),
}));

vi.mock("../../workspace/workspaceApi", () => ({
  createWorkspaceProject: (...args: unknown[]) => createWorkspaceProjectMock(...args),
  updateWorkspaceProject: (...args: unknown[]) => updateWorkspaceProjectMock(...args),
  deleteWorkspaceProject: (...args: unknown[]) => deleteWorkspaceProjectMock(...args),
}));

vi.mock("../runtime/v2WorkflowRunner", () => ({
  markBackendRunLaunchFailed: (...args: unknown[]) => markBackendRunLaunchFailedMock(...args),
  runBackendWorkflow: (...args: unknown[]) => runBackendWorkflowMock(...args),
}));

vi.mock("../../services/v2HttpClient", () => ({
  V2_AUTH_CHANGE_EVENT: "v2-auth-change",
  getStoredAccessToken: () => null,
}));

vi.mock("../../billing/billingApi", () => ({
  getBillingSummary: vi.fn(async () => ({
    account: { balanceCents: 0 },
  })),
}));

describe("FlowTopToolbar", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/projects/project-1");
    createWorkspaceProjectMock.mockReset();
    updateWorkspaceProjectMock.mockReset();
    deleteWorkspaceProjectMock.mockReset();
    setProjectTitleMock.mockReset();
    createPanoramaTargetNodeFromSourceMock.mockReset();
    createPanoramaTargetNodeFromSourceMock.mockReturnValue({ id: "panorama-target-1" });
    markBackendRunLaunchFailedMock.mockReset();
    runBackendWorkflowMock.mockReset();
    runBackendWorkflowMock.mockResolvedValue(undefined);
    mockedStoreState.projectTitle = "Test Project";
    mockedStoreState.nodes = [];
    mockedStoreState.setProjectTitle = setProjectTitleMock;
    mockedStoreState.createPanoramaTargetNodeFromSource = createPanoramaTargetNodeFromSourceMock;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ items: [] }),
        ok: true,
      })),
    );
  });

  afterEach(() => {
    cleanup();
    try {
      vi.runOnlyPendingTimers();
    } catch {}
    try {
      vi.useRealTimers();
    } catch {}
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.pushState(null, "", "/");
  });

  test("renders a clear shared brand mark in the canvas chrome", async () => {
    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved to cloud", status: "saved" }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("brand-mark").getAttribute("data-size")).toBe("canvas");
      expect(screen.getByTestId("brand-mark-orb").className).toContain("h-12 w-[72px]");
      expect(screen.getByRole("img", { name: "Aittco" })).toBeTruthy();
      expect(screen.getByRole("img", { name: "Aittco" }).getAttribute("src")).toBe("/logo-2.png");
      expect(screen.getByDisplayValue("Test Project")).toBeTruthy();
    });
  });

  test.skip("does not render a 360 panorama generate button without a selected image node", async () => {
    mockedStoreState.nodes = [
      {
        data: { generationPrompt: "city dusk", kind: "image", title: "Image 1" },
        id: "image-1",
        selected: false,
        type: "image",
      },
    ];

    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved", status: "saved" }}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /360 全景生成/i })).toBeNull();
    });
  });

  test.skip("does not render a 360 panorama generate button in the top toolbar even for a selected image node", async () => {
    mockedStoreState.nodes = [
      {
        data: {
          generationPrompt: "city dusk skyline",
          kind: "image",
          title: "Image 1",
        },
        id: "image-1",
        selected: true,
        type: "image",
      },
    ];

    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved", status: "saved" }}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /360 全景生成/i })).toBeNull();
    });
  });

  test("renders a disabled 360 panorama generate button without a selected image node", async () => {
    mockedStoreState.nodes = [
      {
        data: { generationPrompt: "city dusk", kind: "image", title: "Image 1" },
        id: "image-1",
        selected: false,
        type: "image",
      },
    ];

    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved", status: "saved" }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /360 全景生成/i }).disabled).toBe(true);
    });
  });

  test("opens the panorama generator from the top toolbar for a selected image node", async () => {
    mockedStoreState.nodes = [
      {
        data: {
          generationPrompt: "city dusk skyline",
          kind: "image",
          title: "Panorama Source",
        },
        id: "image-1",
        selected: true,
        type: "image",
      },
    ];

    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved", status: "saved" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /360 全景生成/i }));

    expect(await screen.findByRole("dialog", { name: "360 全景生成" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2:1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "21:9" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "21:9" }));
    fireEvent.click(screen.getByRole("button", { name: "生成全景" }));

    expect(createPanoramaTargetNodeFromSourceMock).toHaveBeenCalledWith("image-1", "21:9");
    expect(runBackendWorkflowMock).toHaveBeenCalledWith({
      runMode: "target_node",
      targetNodeId: "panorama-target-1",
    });
  });

  test("opens the canvas logo menu as a fixed body-level surface with the narrow minimal layout and closes it on outside click", async () => {
    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved to cloud", status: "saved" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开项目菜单" }));

    const menu = screen.getByRole("menu", { name: "项目菜单" });
    expect(menu).toBeTruthy();
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.left).toBe("20px");
    expect(menu.style.top).toBe("112px");
    expect(menu.style.width).toBe("288px");
    expect(menu.style.zIndex).toBe("2400");
    expect(screen.getByRole("menuitem", { name: "返回工作空间" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "重命名项目" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "新建项目" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "删除项目" })).toBeTruthy();
    expect(screen.getAllByRole("menuitem")[1]?.className).toContain("min-h-[60px]");
    expect(screen.queryByTestId("project-menu-create-icon")).toBeNull();
    expect(screen.queryByTestId("project-menu-delete-icon")).toBeNull();

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryAllByRole("menu")).toHaveLength(0);
    });
  });

  test("closes the project menu when the notifications menu opens", async () => {
    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved to cloud", status: "saved" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开项目菜单" }));
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "通知" }));

    await waitFor(() => {
      expect(screen.queryAllByRole("menu")).toHaveLength(1);
    });
    expect(screen.getByText("全部已读")).toBeTruthy();
  });

  test("hides the top-right credits and notification actions when utility actions are disabled", async () => {
    render(
      <FlowTopToolbar
        cullingEnabled
        hideUtilityActions
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved to cloud", status: "saved" }}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "通知" })).toBeNull();
    });

    expect(screen.getByRole("button", { name: "打开项目菜单" })).toBeTruthy();
    expect(screen.getByDisplayValue("Test Project")).toBeTruthy();
  });

  test("opens a custom dark confirmation sheet before deleting a project", async () => {
    deleteWorkspaceProjectMock.mockResolvedValue(undefined);
    vi.useFakeTimers();

    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved to cloud", status: "saved" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开项目菜单" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除项目" }));

    expect(screen.getByRole("dialog", { name: "删除当前项目" })).toBeTruthy();
    expect(deleteWorkspaceProjectMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "项目菜单" })).toBeNull();

    await act(async () => {
      vi.runOnlyPendingTimers();
    });
  });

  test("closes the delete confirmation sheet on cancel and confirms deletion explicitly", async () => {
    deleteWorkspaceProjectMock.mockResolvedValue(undefined);

    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "Saved to cloud", status: "saved" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开项目菜单" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除项目" }));

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "删除当前项目" })).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "打开项目菜单" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除项目" }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(deleteWorkspaceProjectMock).toHaveBeenCalledWith("project-1");
    });
  });
});
