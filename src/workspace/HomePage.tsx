import React, { useMemo } from "react";
import {
  ArrowRight,
  Images,
  Layers3,
  Mic,
  Scissors,
  Send,
  Sparkles,
  Video,
} from "lucide-react";

import { WORKSPACE_ROUTE } from "../app/routes";
import { ProjectCard } from "./ProjectCard";
import { useWorkspaceProjects } from "./useWorkspaceProjects";
import type { WorkspaceProject } from "./workspaceApi";

const quickPrompts = [
  { icon: Video, label: "AI 视频", description: "快速进入视频创作链路" },
  { icon: Images, label: "图像生成", description: "从灵感到成图更快起步" },
  { icon: Scissors, label: "智能抠图", description: "轻量处理素材细节" },
  { icon: Layers3, label: "批量工作流", description: "把重复流程变成稳定产能" },
];

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function HomePage() {
  const { projects } = useWorkspaceProjects();
  const recentProjects = useMemo(() => projects.slice(0, 3), [projects]);

  const openProject = (project: WorkspaceProject) => {
    navigate(`/projects/${project.id}`);
  };

  return (
    <div className="relative -mx-6 -my-9 min-h-[calc(100vh-80px)] overflow-hidden px-5 py-12 sm:px-6 lg:py-14">
      <div className="absolute inset-0 bg-[#0b0b0d]" />
      <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(rgba(148,163,184,0.32)_1.2px,transparent_1.2px)] [background-size:36px_36px]" />
      <div className="absolute left-0 top-0 h-[560px] w-[760px] bg-[radial-gradient(circle_at_25%_30%,rgba(34,211,238,0.12),transparent_46%)]" />

      <section className="relative mx-auto max-w-[1280px]">
        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(18,46,54,0.92),rgba(12,16,22,0.92))] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.36)] sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-200/[0.06] px-3 py-1 text-[12px] font-medium text-cyan-100">
              <Sparkles size={14} />
              TapFlow AI Workspace
            </div>

            <h1 className="mt-5 max-w-[720px] text-[42px] font-semibold leading-[1.02] text-white sm:text-[50px] lg:text-[58px]">
              把 AI 创作流程变成稳定可复用的产品能力
            </h1>

            <p className="mt-4 max-w-[620px] text-[15px] leading-7 text-slate-300">
              在一个工作区里统一组织项目、素材、画布和模型线路，让创作更快、更稳、更像正式生产流程。
            </p>

            <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-4">
              <div className="mb-3 text-sm font-medium text-slate-200">快速开始</div>
              <div className="flex min-h-[88px] items-center justify-between gap-4 rounded-[18px] border border-white/8 bg-[#12161c] px-5 py-4">
                <span className="max-w-[520px] text-[15px] text-slate-400">
                  描述你的任务，或从下面的能力入口开始。
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    aria-label="语音输入"
                    className="grid h-10 w-10 place-items-center rounded-full text-slate-300 hover:bg-white/[0.08] hover:text-white"
                    type="button"
                  >
                    <Mic size={18} />
                  </button>
                  <button
                    aria-label="发送"
                    className="grid h-11 w-11 place-items-center rounded-full bg-white text-slate-950 hover:bg-cyan-100"
                    type="button"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {quickPrompts.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
                    key={item.label}
                    type="button"
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_56px_rgba(0,0,0,0.22)]">
              <div className="mb-3 text-sm font-medium text-slate-200">能力预览</div>
              <div className="grid gap-3">
                {quickPrompts.map((item) => (
                  <div
                    className="rounded-[18px] border border-white/8 bg-[#13181f] px-4 py-4"
                    key={`${item.label}-preview`}
                  >
                    <div className="text-sm font-semibold text-white">{item.label}</div>
                    <div className="mt-1 text-sm leading-6 text-slate-400">{item.description}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_56px_rgba(0,0,0,0.22)]">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200">继续最近项目</span>
                <button
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white"
                  onClick={() => navigate(WORKSPACE_ROUTE)}
                  type="button"
                >
                  所有项目
                  <ArrowRight size={16} />
                </button>
              </div>

              <div className="grid gap-4">
                {recentProjects.map((project) => (
                  <ProjectCard
                    compact
                    key={project.id}
                    onOpen={openProject}
                    project={project}
                    viewMode="grid"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
