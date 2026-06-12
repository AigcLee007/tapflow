import React, { useMemo } from "react";
import { ArrowRight, Images, Layers3, Mic, Scissors, Send, Sparkles, Video } from "lucide-react";

import { WORKSPACE_ROUTE } from "../app/routes";
import { ProjectCard } from "./ProjectCard";
import { useWorkspaceProjects } from "./useWorkspaceProjects";
import type { WorkspaceProject } from "./workspaceApi";

const quickPrompts = [
  { icon: Video, label: "AI 视频" },
  { icon: Images, label: "图像生成" },
  { icon: Scissors, label: "智能抠图" },
  { icon: Layers3, label: "批量工作流" },
];

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function HomePage() {
  const { projects } = useWorkspaceProjects();
  const recentProjects = useMemo(() => projects.slice(0, 4), [projects]);

  const openProject = (project: WorkspaceProject) => {
    navigate(`/projects/${project.id}`);
  };

  return (
    <div className="relative -mx-6 -my-9 min-h-[calc(100vh-80px)] overflow-hidden px-5 py-16 sm:px-6 lg:py-20">
      <div className="absolute inset-0 bg-[#0b0b0d]" />
      <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(rgba(148,163,184,0.36)_1.2px,transparent_1.2px)] [background-size:36px_36px]" />
      <div className="absolute left-0 top-0 h-[520px] w-[760px] bg-[radial-gradient(circle_at_25%_30%,rgba(34,211,238,0.12),transparent_46%)]" />

      <section className="relative mx-auto max-w-[1220px]">
        <div className="mb-7 flex items-center justify-center gap-4">
          <span className="grid h-13 w-13 place-items-center rounded-full bg-white text-slate-950">
            <Sparkles size={24} />
          </span>
          <h1 className="text-center text-[46px] font-semibold leading-none text-white sm:text-[54px] lg:text-[62px]">
            今天要做点什么？
          </h1>
        </div>

        <div className="rounded-[26px] border border-white/14 bg-[#202022]/72 p-3 shadow-[0_22px_70px_rgba(0,0,0,0.34)]">
          <div className="flex min-h-[118px] items-center justify-between gap-4 rounded-[20px] bg-[#1a1a1c] px-6 py-5">
            <span className="text-lg text-slate-400 sm:text-xl">开始一段灵感对话...</span>
            <div className="flex shrink-0 items-center gap-3">
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

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {quickPrompts.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
                key={item.label}
                type="button"
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-9">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">最近项目</h2>
            <button
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white"
              onClick={() => navigate(WORKSPACE_ROUTE)}
              type="button"
            >
              所有项目 <ArrowRight size={16} />
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {recentProjects.map((project) => (
              <ProjectCard compact key={project.id} onOpen={openProject} project={project} viewMode="grid" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
