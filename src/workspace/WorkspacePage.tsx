import React, { useMemo, useState } from "react";
import { ArrowRight, Mic, Send, Sparkles } from "lucide-react";

import { CreateProjectCard } from "./CreateProjectCard";
import { ProjectCard } from "./ProjectCard";
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

  const recentProjects = useMemo(() => projects.slice(0, 3), [projects]);

  const openProject = (project: WorkspaceProject) => {
    navigate(`/projects/${project.id}`);
  };

  const createAndOpen = async (input: { description?: string | null; name: string }) => {
    const result = await createProject(input);
    navigate(`/projects/${result.project.id}`);
  };

  const scrollToProjects = () => {
    const target = document.getElementById("workspace-projects");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[28px] border border-white/8 bg-[#0f1013] px-6 py-12 sm:px-10 lg:px-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_88%_70%,rgba(148,163,184,0.10),transparent_34%)]" />
        <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(rgba(148,163,184,0.35)_1px,transparent_1px)] [background-size:36px_36px]" />

        <div className="relative mx-auto max-w-5xl">
          <div className="mb-8 flex items-center justify-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-slate-950">
              <Sparkles size={22} />
            </span>
            <h1 className="text-center text-5xl font-semibold tracking-tight text-white sm:text-6xl">
              今天要做点什么？
            </h1>
          </div>

          <div className="rounded-[28px] border border-white/12 bg-white/[0.06] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
            <div className="flex min-h-24 items-center justify-between gap-4 rounded-[22px] bg-[#1b1b1d] px-6 py-4">
              <span className="text-lg text-slate-400">开始一段灵感对话...</span>
              <div className="flex items-center gap-4">
                <button
                  aria-label="语音输入"
                  className="grid h-11 w-11 place-items-center rounded-full text-slate-300 hover:bg-white/[0.08] hover:text-white"
                  type="button"
                >
                  <Mic size={21} />
                </button>
                <button
                  aria-label="发送"
                  className="grid h-12 w-12 place-items-center rounded-full bg-white text-slate-950 hover:bg-cyan-100"
                  type="button"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">最近项目</h2>
              <button
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white"
                onClick={scrollToProjects}
                type="button"
              >
                所有项目
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <CreateProjectCard creating={creating} onCreate={createAndOpen} compact />
              {recentProjects.map((project) => (
                <ProjectCard compact key={project.id} onOpen={openProject} project={project} viewMode="grid" />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6" id="workspace-projects">
        <WorkspaceHeader projects={projects} />

        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
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

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid min-h-64 place-items-center rounded-[22px] border border-white/10 bg-white/[0.04] text-sm text-slate-400">
            正在加载项目...
          </div>
        ) : (
          <ProjectGrid
            creating={creating}
            onCreate={createAndOpen}
            onOpen={openProject}
            projects={filteredProjects}
            viewMode={viewMode}
          />
        )}
      </section>
    </div>
  );
}
