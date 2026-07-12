import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { WorkspacePage } from "./WorkspacePage";
import type { WorkspaceProject } from "./workspaceApi";

const useWorkspaceProjectsMock = vi.fn();
const updateWorkspaceProjectMock = vi.fn();
const deleteWorkspaceProjectMock = vi.fn();

vi.mock("./useWorkspaceProjects", () => ({
  useWorkspaceProjects: () => useWorkspaceProjectsMock(),
}));

vi.mock("./workspaceApi", () => ({
  updateWorkspaceProject: (...args: unknown[]) => updateWorkspaceProjectMock(...args),
  deleteWorkspaceProject: (...args: unknown[]) => deleteWorkspaceProjectMock(...args),
}));

vi.mock("../assets/assetApi", () => ({
  getAssetDownloadUrl: vi.fn(async () => ({
    expiresAt: "2026-06-12T01:00:00.000Z",
    method: "GET",
    url: "https://example.test/cover.png",
  })),
}));

const project: WorkspaceProject = {
  coverAssetId: null,
  coverUrl: "https://example.test/visual-strategy.png",
  createdAt: "2026-06-12T01:00:00.000Z",
  createdBy: "user-1",
  description: "统一视觉风格",
  id: "project-1",
  name: "Visual Strategy",
  tenantId: "tenant-1",
  updatedAt: "2026-06-12T02:00:00.000Z",
};

function mockWorkspaceProjects(overrides: Record<string, unknown> = {}) {
  useWorkspaceProjectsMock.mockReturnValue({
    createProject: vi.fn(async () => ({ project })),
    creating: false,
    error: null,
    filteredProjects: [project],
    loading: false,
    projects: [project],
    query: "",
    refresh: vi.fn(async () => undefined),
    removeProjectOptimistically: vi.fn(async () => undefined),
    scope: "personal",
    setQuery: vi.fn(),
    setScope: vi.fn(),
    setShowAll: vi.fn(),
    setSortMode: vi.fn(),
    showAll: true,
    sortMode: "updated_desc",
    ...overrides,
  });
}

describe("WorkspacePage", () => {
  beforeEach(() => {
    useWorkspaceProjectsMock.mockReset();
    updateWorkspaceProjectMock.mockReset();
    deleteWorkspaceProjectMock.mockReset();
    mockWorkspaceProjects();
  });

  test("renders projects directly without the old workspace hero banner", () => {
    render(<WorkspacePage />);

    expect(screen.queryByRole("heading", { name: "今天要做点什么？" })).toBeNull();
    expect(screen.queryByText("开始一段灵感对话...")).toBeNull();
    expect(screen.queryByRole("heading", { name: "我的工作空间" })).toBeNull();
    expect(screen.queryByText("继续最近编辑、筛选项目并进入画布。")).toBeNull();
    expect(
      screen.queryByText((_, element) => element?.textContent?.replace(/\s+/g, " ").trim() === "共 1 个项目"),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "个人" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "团队项目" })).toBeTruthy();
    expect(screen.getByPlaceholderText("搜索")).toBeTruthy();
    expect(screen.getByRole("button", { name: "显示全部" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /排序/ })).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("button", { name: "网格视图" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "列表视图" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "新建项目" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Visual Strategy").length).toBeGreaterThan(0);
  });

  test("creates a default-named project and opens it without asking for a name first", async () => {
    const createProject = vi.fn(async () => ({ project: { ...project, id: "created-project" } }));
    mockWorkspaceProjects({ createProject });

    render(<WorkspacePage />);

    fireEvent.click(screen.getAllByRole("button", { name: "新建项目" })[0]!);

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({
        description: null,
        name: expect.stringMatching(/^新项目 \d{2}-\d{2} \d{2}:\d{2}$/),
      });
    });
    expect(window.location.pathname).toBe("/projects/created-project");
    expect(screen.queryByPlaceholderText("项目名称")).toBeNull();
  });

  test("opens a project action menu and renames the project", async () => {
    const refresh = vi.fn(async () => undefined);
    mockWorkspaceProjects({ refresh });
    updateWorkspaceProjectMock.mockResolvedValue({ ...project, name: "Renamed Project" });

    render(<WorkspacePage />);

    fireEvent.click(screen.getByRole("button", { name: "管理项目 Visual Strategy" }));
    expect(screen.getByRole("menuitem", { name: "打开" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));

    const input = screen.getByLabelText("项目名称");
    expect(input.closest("article")).toBeNull();
    fireEvent.change(input, { target: { value: "Renamed Project" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateWorkspaceProjectMock).toHaveBeenCalledWith("project-1", { name: "Renamed Project" });
    });
    expect(refresh).toHaveBeenCalled();
  });

  test("selects a project from the action menu", () => {
    render(<WorkspacePage />);

    fireEvent.click(screen.getByRole("button", { name: "管理项目 Visual Strategy" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "选择" }));

    expect(screen.getByText("已选择 1 个项目")).toBeTruthy();
  });

  test("uses branded workspace transition while projects load", () => {
    mockWorkspaceProjects({ loading: true, projects: [], filteredProjects: [] });

    render(<WorkspacePage />);

    expect(screen.getByText("正在加载项目...")).toBeTruthy();
    expect(screen.getByTestId("brand-transition").getAttribute("data-variant")).toBe("workspace");
    expect(screen.getByTestId("brand-transition").getAttribute("data-mode")).toBe("inline");
  });

  test("deletes a project from the action menu without forcing a loading refresh", async () => {
    const refresh = vi.fn(async () => undefined);
    const removeProjectOptimistically = vi.fn(async () => undefined);
    mockWorkspaceProjects({ refresh, removeProjectOptimistically });
    deleteWorkspaceProjectMock.mockResolvedValue({ ok: true });

    render(<WorkspacePage />);

    fireEvent.click(screen.getByRole("button", { name: "管理项目 Visual Strategy" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(removeProjectOptimistically).toHaveBeenCalledWith("project-1", expect.any(Function));
    });
    expect(deleteWorkspaceProjectMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
