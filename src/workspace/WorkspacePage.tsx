import React, { useState } from "react";

import { BrandTransition } from "../app/brand/BrandTransition";
import { ProjectGrid } from "./ProjectGrid";
import { ProjectTabs } from "./ProjectTabs";
import { ProjectToolbar } from "./ProjectToolbar";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { useWorkspaceProjects } from "./useWorkspaceProjects";
import { deleteWorkspaceProject, updateWorkspaceProject, type WorkspaceProject } from "./workspaceApi";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function WorkspacePage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(() => new Set());
  const {
    createProject,
    creating,
    error,
    filteredProjects,
    loading,
    projects,
    query,
    refresh,
    removeProjectOptimistically,
    scope,
    setQuery,
    setScope,
    setShowAll,
    setSortMode,
    showAll,
    sortMode,
  } = useWorkspaceProjects();

  const openProject = (project: WorkspaceProject) => {
    navigate(`/projects/${project.id}`);
  };

  const createAndOpen = async (input: { description?: string | null; name: string }) => {
    const result = await createProject(input);
    navigate(`/projects/${result.project.id}`);
  };

  const renameProject = async (project: WorkspaceProject, name: string) => {
    await updateWorkspaceProject(project.id, { name });
    await refresh();
  };

  const deleteProject = async (project: WorkspaceProject) => {
    await removeProjectOptimistically(project.id, async () => {
      await deleteWorkspaceProject(project.id);
    });
    setSelectedProjectIds((current) => {
      const next = new Set(current);
      next.delete(project.id);
      return next;
    });
  };

  const selectProject = (project: WorkspaceProject) => {
    setSelectedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(project.id)) {
        next.delete(project.id);
      } else {
        next.add(project.id);
      }
      return next;
    });
  };

  return (
    <div className="relative -mx-6 -my-9 min-h-[calc(100vh-80px)] overflow-hidden px-5 py-14 sm:px-6 lg:py-16">
      <div className="absolute inset-0 bg-[#0b0b0d]" />
      <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(rgba(148,163,184,0.36)_1.2px,transparent_1.2px)] [background-size:36px_36px]" />
      <div className="absolute left-0 top-0 h-[520px] w-[760px] bg-[radial-gradient(circle_at_25%_30%,rgba(34,211,238,0.12),transparent_46%)]" />

      <section className="relative mx-auto max-w-[1760px] space-y-5">
        <WorkspaceHeader projects={projects} />

        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 xl:flex-row xl:items-center xl:justify-between">
          <ProjectTabs onChange={setScope} scope={scope} />
          <ProjectToolbar
            disabled={loading}
            onCreate={() => {
              const target = document.querySelector<HTMLButtonElement>("[data-create-project-trigger='true']");
              target?.click();
            }}
            onQueryChange={setQuery}
            onRefresh={() => void refresh()}
            onShowAllChange={setShowAll}
            onSortChange={setSortMode}
            onViewModeChange={setViewMode}
            query={query}
            showAll={showAll}
            sortMode={sortMode}
            viewMode={viewMode}
          />
        </div>

        {selectedProjectIds.size > 0 && (
          <div className="inline-flex h-10 items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 text-sm font-semibold text-cyan-100">
            已选择 {selectedProjectIds.size} 个项目
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="relative min-h-64 overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04]">
            <BrandTransition
              label="正在加载项目..."
              sublabel="正在同步工作空间和项目封面"
              variant="workspace"
              mode="inline"
            />
          </div>
        ) : (
          <ProjectGrid
            creating={creating}
            onCreate={createAndOpen}
            onDelete={deleteProject}
            onOpen={openProject}
            onRename={renameProject}
            onSelect={selectProject}
            projects={filteredProjects}
            selectedProjectIds={selectedProjectIds}
            viewMode={viewMode}
          />
        )}
      </section>
    </div>
  );
}
