import React from "react";

import { CreateProjectCard } from "./CreateProjectCard";
import { ProjectCard } from "./ProjectCard";
import type { WorkspaceProject } from "./workspaceApi";

export function ProjectGrid({
  creating,
  onCreate,
  onOpen,
  projects,
  viewMode,
}: {
  creating: boolean;
  onCreate: (input: { description?: string | null; name: string }) => Promise<void>;
  onOpen: (project: WorkspaceProject) => void;
  projects: WorkspaceProject[];
  viewMode: "grid" | "list";
}) {
  if (viewMode === "list") {
    return (
      <div className="space-y-3">
        <CreateProjectCard creating={creating} onCreate={onCreate} viewMode={viewMode} />
        {projects.map((project) => (
          <ProjectCard key={project.id} onOpen={onOpen} project={project} viewMode={viewMode} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <CreateProjectCard creating={creating} onCreate={onCreate} viewMode={viewMode} />
      {projects.map((project) => (
        <ProjectCard key={project.id} onOpen={onOpen} project={project} viewMode={viewMode} />
      ))}
    </div>
  );
}
