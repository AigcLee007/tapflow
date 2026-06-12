import React from "react";

import { CreateProjectCard } from "./CreateProjectCard";
import { ProjectCard } from "./ProjectCard";
import type { WorkspaceProject } from "./workspaceApi";

export function ProjectGrid({
  creating,
  onCreate,
  onDelete,
  onOpen,
  onRename,
  onSelect,
  projects,
  selectedProjectIds = new Set<string>(),
  viewMode,
}: {
  creating: boolean;
  onCreate: (input: { description?: string | null; name: string }) => Promise<void>;
  onDelete: (project: WorkspaceProject) => Promise<void>;
  onOpen: (project: WorkspaceProject) => void;
  onRename: (project: WorkspaceProject, name: string) => Promise<void>;
  onSelect: (project: WorkspaceProject) => void;
  projects: WorkspaceProject[];
  selectedProjectIds?: Set<string>;
  viewMode: "grid" | "list";
}) {
  if (viewMode === "list") {
    return (
      <div className="overflow-visible rounded-[28px] bg-[#19191a] px-8 py-7">
        <div className="grid grid-cols-[180px_1.2fr_1fr_1.3fr_1.2fr_76px] border-b border-white/10 pb-6 text-lg text-slate-500">
          <div>预览</div>
          <div>名称</div>
          <div>类型</div>
          <div>创建时间</div>
          <div>最近更新</div>
          <div />
        </div>
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            onDelete={onDelete}
            onOpen={onOpen}
            onRename={onRename}
            onSelect={onSelect}
            project={project}
            selected={selectedProjectIds.has(project.id)}
            viewMode={viewMode}
          />
        ))}
        {projects.length === 0 && <CreateProjectCard creating={creating} onCreate={onCreate} viewMode={viewMode} />}
      </div>
    );
  }

  return (
    <div className="grid gap-7 overflow-visible sm:grid-cols-2 xl:grid-cols-4">
      <CreateProjectCard creating={creating} onCreate={onCreate} viewMode={viewMode} />
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          onDelete={onDelete}
          onOpen={onOpen}
          onRename={onRename}
          onSelect={onSelect}
          project={project}
          selected={selectedProjectIds.has(project.id)}
          viewMode={viewMode}
        />
      ))}
    </div>
  );
}
