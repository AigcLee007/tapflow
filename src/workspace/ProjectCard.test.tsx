import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ProjectCard } from "./ProjectCard";
import type { WorkspaceProject } from "./workspaceApi";

const getAssetDownloadUrlMock = vi.fn();

vi.mock("../assets/assetApi", () => ({
  getAssetDownloadUrl: (...args: unknown[]) => getAssetDownloadUrlMock(...args),
}));

const baseProject: WorkspaceProject = {
  coverAssetId: "asset-cover-1",
  createdAt: "2026-05-19T00:00:00.000Z",
  createdBy: "user-1",
  description: "Demo project",
  id: "project-1",
  name: "Demo project",
  tenantId: "tenant-1",
  updatedAt: "2026-05-19T00:00:00.000Z",
};

describe("ProjectCard", () => {
  beforeEach(() => {
    getAssetDownloadUrlMock.mockReset();
  });

  it("uses coverAssetId to fetch a temporary download url", async () => {
    getAssetDownloadUrlMock.mockResolvedValue({
      expiresAt: "2026-05-19T01:00:00.000Z",
      method: "GET",
      url: "https://example.test/project-cover.png",
    });

    const { container } = render(
      <ProjectCard onOpen={() => undefined} project={baseProject} viewMode="grid" />,
    );

    await waitFor(() => {
      expect(getAssetDownloadUrlMock).toHaveBeenCalledWith("asset-cover-1");
    });

    await waitFor(() => {
      const image = container.querySelector("img");
      expect(image?.getAttribute("src")).toBe("https://example.test/project-cover.png");
    });
  });

  it("falls back gracefully when the cover asset cannot be loaded", async () => {
    getAssetDownloadUrlMock.mockRejectedValue(new Error("boom"));

    render(<ProjectCard onOpen={() => undefined} project={baseProject} viewMode="grid" />);

    await waitFor(() => {
      expect(screen.getByText("Cover unavailable")).toBeTruthy();
    });
  });
});
