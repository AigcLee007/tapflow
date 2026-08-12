import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { HomePage } from "./HomePage";
import type { WorkspaceProject } from "./workspaceApi";

const useWorkspaceProjectsMock = vi.fn();
const createProjectMock = vi.fn();

vi.mock("./useWorkspaceProjects", () => ({
  useWorkspaceProjects: () => useWorkspaceProjectsMock(),
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

function mockWorkspaceProjects() {
  createProjectMock.mockResolvedValue({ project: { ...project, id: "project-new", name: "新项目" } });
  useWorkspaceProjectsMock.mockReturnValue({
    createProject: createProjectMock,
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
  });
}

describe("HomePage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/home");
    useWorkspaceProjectsMock.mockReset();
    createProjectMock.mockReset();
    mockWorkspaceProjects();
  });

  test("shows a useful workspace overview instead of the AI marketing hero", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "欢迎回来" })).toBeTruthy();
    expect(screen.getByText("继续工作")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "新建项目" })).toBeTruthy();
    expect(screen.getByText("最近项目")).toBeTruthy();
    expect(screen.getByText("工作区状态")).toBeTruthy();
    expect(screen.getAllByText("Visual Strategy").length).toBeGreaterThan(0);
    expect(screen.queryByText("把 AI 创作流程变成稳定可复用的产品能力")).toBeNull();
    expect(screen.queryByText("能力预览")).toBeNull();
  });

  test("creates an empty project and opens its canvas", async () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "新建空白项目" }));

    await waitFor(() => expect(createProjectMock).toHaveBeenCalledTimes(1));
    expect(window.location.pathname).toBe("/projects/project-new");
  });

  test("routes template and upload actions to existing product pages", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "从提示词开始" }));
    expect(window.location.pathname).toBe("/prompts");

    window.history.replaceState(null, "", "/home");
    fireEvent.click(screen.getByRole("button", { name: "上传素材" }));
    expect(window.location.pathname).toBe("/assets");
  });
});
