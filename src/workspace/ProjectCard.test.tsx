import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ProjectCard } from "./ProjectCard";
import type { WorkspaceProject } from "./workspaceApi";

const baseProject: WorkspaceProject = {
  coverAssetId: "asset-cover-1",
  coverUrl: "https://example.test/project-cover.png",
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
  });

  it("renders the pre-resolved project cover url without requesting it per card", () => {
    const { container } = render(
      <ProjectCard onOpen={() => undefined} project={baseProject} viewMode="grid" />,
    );

    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe("https://example.test/project-cover.png");
  });

  it("falls back to the gradient cover when no resolved cover url exists", () => {
    render(
      <ProjectCard
        onOpen={() => undefined}
        project={{ ...baseProject, coverAssetId: null, coverUrl: undefined }}
        viewMode="grid"
      />,
    );

    expect(screen.queryByText("Cover unavailable")).toBeNull();
  });
});
