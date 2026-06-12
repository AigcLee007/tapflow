import React from "react";

import type { WorkspaceProject } from "./workspaceApi";

export function WorkspaceHeader({ projects }: { projects: WorkspaceProject[] }) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-[34px] font-semibold leading-tight text-white md:text-[42px]">我的空间</h2>
        <p className="mt-2 text-base text-slate-400">管理你的 AI Flow 项目，继续创作、筛选和打开画布。</p>
      </div>
      <div className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-slate-400">
        共 <span className="font-semibold text-white">{projects.length}</span> 个项目
      </div>
    </header>
  );
}
