import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { WorkspacePage } from "./WorkspacePage";
import type { WorkspaceProject } from "./workspaceApi";

const useWorkspaceProjectsMock = vi.fn();

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
    mockWorkspaceProjects();
  });

  test("renders a creator home prompt with recent projects", () => {
    render(<WorkspacePage />);

    expect(screen.getByRole("heading", { name: "今天要做点什么？" })).toBeTruthy();
    expect(screen.getByText("开始一段灵感对话...")).toBeTruthy();
    expect(screen.getByText("最近项目")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "新建项目" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Visual Strategy").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "所有项目" })).toBeTruthy();
  });

  test("renders TapNow-style project controls", () => {
    render(<WorkspacePage />);

    expect(screen.getByRole("button", { name: "个人" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "团队项目" })).toBeTruthy();
    expect(screen.getByPlaceholderText("搜索")).toBeTruthy();
    expect(screen.getByRole("button", { name: "显示全部" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "网格视图" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "列表视图" })).toBeTruthy();
  });
});
