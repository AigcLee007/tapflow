import React, { useState } from "react";

import { ProjectGrid } from "./ProjectGrid";
import { ProjectTabs } from "./ProjectTabs";
import { ProjectToolbar } from "./ProjectToolbar";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { useWorkspaceProjects } from "./useWorkspaceProjects";
import type { WorkspaceProject } from "./workspaceApi";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function WorkspacePage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const {
    createProject,
    creating,
    error,
    filteredProjects,
    loading,
    projects,
    query,
    refresh,
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

  return (
    <div className="space-y-5">
      <WorkspaceHeader projects={projects} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ProjectTabs onChange={setScope} scope={scope} />
        <ProjectToolbar
          disabled={loading}
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

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid min-h-64 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-sm text-slate-400">
          Loading projects...
        </div>
      ) : (
        <ProjectGrid
          creating={creating}
          onCreate={async (input) => {
            const result = await createProject(input);
            navigate(`/projects/${result.project.id}`);
          }}
          onOpen={openProject}
          projects={filteredProjects}
          viewMode={viewMode}
        />
      )}
    </div>
  );
}
