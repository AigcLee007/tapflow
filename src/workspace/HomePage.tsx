import React, { useMemo } from "react";
import {
  ArrowRight,
  CalendarDays,
  FilePlus2,
  FolderKanban,
  ImageUp,
  LayoutTemplate,
} from "lucide-react";

import { ASSETS_ROUTE, PROMPTS_ROUTE, WORKSPACE_ROUTE } from "../app/routes";
import { useWorkspaceProjects } from "./useWorkspaceProjects";
import type { WorkspaceProject } from "./workspaceApi";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function makeProjectName() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `新项目 ${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function HomeProjectCard({ onOpen, project }: { onOpen: (project: WorkspaceProject) => void; project: WorkspaceProject }) {
  const updatedAt = new Date(project.updatedAt);
  const updatedLabel = Number.isNaN(updatedAt.getTime())
    ? "最近编辑"
    : updatedAt.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });

  return (
    <button
      aria-label={`打开项目 ${project.name}`}
      className="group min-w-0 border border-white/[0.09] bg-[#15171a] p-3 text-left transition hover:border-white/20 hover:bg-[#191c20]"
      onClick={() => onOpen(project)}
      type="button"
    >
      <div className="relative aspect-[16/9] overflow-hidden rounded-[8px] bg-[linear-gradient(135deg,#30343a,#1f3940)]">
        {project.coverUrl ? (
          <img alt="" className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" decoding="async" loading="lazy" src={project.coverUrl} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-white/20"><FolderKanban size={28} /></div>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-white">{project.name || "未命名项目"}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500"><CalendarDays size={12} />{updatedLabel} 编辑</div>
        </div>
        <ArrowRight className="mt-0.5 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-white" size={15} />
      </div>
    </button>
  );
}

export function HomePage() {
  const { createProject, creating, error, loading, projects } = useWorkspaceProjects();
  const recentProjects = useMemo(
    () => [...projects].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()).slice(0, 4),
    [projects],
  );
  const latestProject = recentProjects[0] ?? null;

  const openProject = (project: WorkspaceProject) => navigate(`/projects/${project.id}`);

  const createAndOpenProject = async () => {
    const result = await createProject({ description: null, name: makeProjectName() });
    navigate(`/projects/${result.project.id}`);
  };

  return (
    <div className="relative -mx-6 -my-9 min-h-[calc(100vh-96px)] bg-[#0d0f11] px-5 py-8 sm:px-6 lg:py-10">
      <section className="mx-auto max-w-[1440px] space-y-6">
        <header className="flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="text-[12px] font-semibold text-cyan-100">创作工作台</div>
            <h1 className="mt-2 text-[30px] font-semibold leading-tight text-white sm:text-[38px]">欢迎回来</h1>
            <p className="mt-2 text-[13px] text-slate-400">继续上次的创作，或者从一个新项目开始。</p>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-[8px] bg-white px-4 text-[12px] font-semibold text-[#141619] transition hover:bg-slate-200 disabled:cursor-wait disabled:opacity-60 sm:self-auto"
            disabled={creating}
            onClick={() => void createAndOpenProject()}
            type="button"
          >
            <FilePlus2 size={16} />
            {creating ? "正在创建..." : "新建项目"}
          </button>
        </header>

        {error ? <div className="border border-red-400/25 bg-red-400/10 px-4 py-3 text-[12px] text-red-100">{error}</div> : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
          <section className="border border-white/[0.1] bg-[#141619] p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-bold text-white">继续工作</h2>
              {latestProject ? <span className="text-[11px] text-slate-500">最近编辑的项目</span> : null}
            </div>

            {loading ? (
              <div className="grid min-h-[280px] place-items-center rounded-[8px] bg-white/[0.03] text-[12px] text-slate-500">正在加载项目...</div>
            ) : latestProject ? (
              <>
                <button className="group relative block aspect-[16/7] w-full overflow-hidden rounded-[8px] bg-[linear-gradient(135deg,#30343a,#1f3940)] text-left" onClick={() => openProject(latestProject)} type="button">
                  {latestProject.coverUrl ? <img alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.015]" src={latestProject.coverUrl} /> : <div className="absolute inset-0 grid place-items-center text-white/15"><FolderKanban size={54} /></div>}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <span className="absolute bottom-4 left-4 rounded-[6px] border border-white/15 bg-black/35 px-2.5 py-1.5 text-[10px] font-semibold text-white/80">项目画布</span>
                </button>
                <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div className="min-w-0">
                    <div className="truncate text-[19px] font-semibold text-white">{latestProject.name}</div>
                    <div className="mt-1 truncate text-[12px] text-slate-500">{latestProject.description || "打开画布继续创作"}</div>
                  </div>
                  <button className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-white px-4 text-[12px] font-semibold text-[#141619] hover:bg-slate-200" onClick={() => openProject(latestProject)} type="button">打开画布 <ArrowRight size={15} /></button>
                </div>
              </>
            ) : (
              <div className="grid min-h-[280px] place-items-center rounded-[8px] border border-dashed border-white/[0.12] bg-white/[0.02] px-5 text-center">
                <div><FolderKanban className="mx-auto text-slate-600" size={32} /><div className="mt-3 text-[14px] font-semibold text-white">还没有项目</div><div className="mt-1 text-[12px] text-slate-500">创建第一个项目，开始组织你的创作。</div></div>
              </div>
            )}
          </section>

          <section className="border border-white/[0.1] bg-[#141619] p-4 sm:p-5">
            <h2 className="text-[13px] font-bold text-white">新建项目</h2>
            <div className="mt-4 space-y-2">
              <HomeAction icon={FilePlus2} label="新建空白项目" onClick={() => void createAndOpenProject()} primary />
              <HomeAction icon={LayoutTemplate} label="从提示词开始" onClick={() => navigate(PROMPTS_ROUTE)} />
              <HomeAction icon={ImageUp} label="上传素材" onClick={() => navigate(ASSETS_ROUTE)} />
            </div>
            <div className="mt-6 border-t border-white/[0.08] pt-5">
              <div className="text-[11px] text-slate-500">当前工作区</div>
              <div className="mt-2 text-[16px] font-semibold text-white">{projects.length} 个项目</div>
              <button className="mt-4 inline-flex items-center gap-2 text-[11px] font-semibold text-slate-400 hover:text-white" onClick={() => navigate(WORKSPACE_ROUTE)} type="button">管理所有项目 <ArrowRight size={13} /></button>
            </div>
          </section>
        </div>

        <section className="border border-white/[0.1] bg-[#121416] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-bold text-white">最近项目</h2>
            <button className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-500 hover:text-white" onClick={() => navigate(WORKSPACE_ROUTE)} type="button">查看全部 <ArrowRight size={13} /></button>
          </div>
          {recentProjects.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{recentProjects.map((project) => <HomeProjectCard key={project.id} onOpen={openProject} project={project} />)}</div> : <div className="py-8 text-center text-[12px] text-slate-500">项目创建后会显示在这里。</div>}
        </section>

        <section className="border border-white/[0.1] bg-[#121416] px-4 py-4 sm:px-5">
          <h2 className="sr-only">工作区状态</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <HomeMetric detail="当前账户可访问" label="项目" value={String(projects.length)} />
            <HomeMetric detail="草稿自动写入服务器" label="画布保存" value="已启用" />
            <HomeMetric detail="图片、视频与音频" label="云端素材" value="已同步" />
          </div>
        </section>
      </section>
    </div>
  );
}

function HomeAction({ icon: Icon, label, onClick, primary = false }: { icon: React.ComponentType<{ size?: number }>; label: string; onClick: () => void; primary?: boolean }) {
  return <button className={`flex h-11 w-full items-center gap-3 rounded-[8px] px-3 text-left text-[12px] font-semibold transition ${primary ? "bg-white text-[#151719] hover:bg-slate-200" : "border border-white/[0.1] bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]"}`} onClick={onClick} type="button"><span className={`grid h-7 w-7 place-items-center rounded-[7px] ${primary ? "bg-black/[0.08]" : "bg-white/[0.07]"}`}><Icon size={15} /></span>{label}</button>;
}

function HomeMetric({ detail, label, value }: { detail: string; label: string; value: string }) {
  return <div className="border-l border-white/[0.09] pl-4 first:border-l-0 first:pl-0"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 text-[18px] font-semibold text-white">{value}</div><div className="mt-1 text-[10px] text-slate-600">{detail}</div></div>;
}
