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

  test("renders TapNow-style project controls without the home prompt", () => {
    render(<WorkspacePage />);

    expect(screen.queryByRole("heading", { name: "今天要做点什么？" })).toBeNull();
    expect(screen.queryByText("开始一段灵感对话...")).toBeNull();
    expect(screen.getByRole("button", { name: "个人" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "团队项目" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "我的空间" })).toBeTruthy();
    expect(screen.getByText("管理你的 AI Flow 项目，继续创作、筛选和打开画布。")).toBeTruthy();
    expect(screen.getByPlaceholderText("搜索")).toBeTruthy();
    expect(screen.getByRole("button", { name: "显示全部" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "网格视图" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "列表视图" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "新建项目" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Visual Strategy").length).toBeGreaterThan(0);
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
    fireEvent.change(input, { target: { value: "Renamed Project" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(updateWorkspaceProjectMock).toHaveBeenCalledWith("project-1", { name: "Renamed Project" });
    });
    expect(refresh).toHaveBeenCalled();
  });

  test("deletes a project from the action menu", async () => {
    const refresh = vi.fn(async () => undefined);
    mockWorkspaceProjects({ refresh });
    deleteWorkspaceProjectMock.mockResolvedValue({ ok: true });

    render(<WorkspacePage />);

    fireEvent.click(screen.getByRole("button", { name: "管理项目 Visual Strategy" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(deleteWorkspaceProjectMock).toHaveBeenCalledWith("project-1");
    });
    expect(refresh).toHaveBeenCalled();
  });
});
