import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { HomePage } from "./HomePage";
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

function mockWorkspaceProjects() {
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
  });
}

describe("HomePage", () => {
  beforeEach(() => {
    useWorkspaceProjectsMock.mockReset();
    mockWorkspaceProjects();
  });

  test("shows a brand-led premium hero with quick start and recent project continuation", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "把 AI 创作流程变成稳定可复用的产品能力" }),
    ).toBeTruthy();
    expect(screen.getByText("快速开始")).toBeTruthy();
    expect(screen.getByText("能力预览")).toBeTruthy();
    expect(screen.getByText("继续最近项目")).toBeTruthy();
    expect(screen.getByRole("button", { name: "AI 视频" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "图像生成" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "智能抠图" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "批量工作流" })).toBeTruthy();
    expect(screen.getAllByText("Visual Strategy").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "所有项目" })).toBeTruthy();
  });
});
