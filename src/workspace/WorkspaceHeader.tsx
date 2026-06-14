import React from "react";

import type { WorkspaceProject } from "./workspaceApi";

export function WorkspaceHeader({ projects }: { projects: WorkspaceProject[] }) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-[38px] font-semibold leading-none text-white md:text-[44px]">我的工作空间</h1>
        <p className="mt-3 text-[15px] text-slate-300">继续最近编辑、筛选项目并进入画布。</p>
      </div>
      <div className="inline-flex h-12 items-center rounded-full border border-white/10 bg-white/[0.04] px-5 text-lg font-semibold text-white">
        共 <span className="mx-1">{projects.length}</span> 个项目
      </div>
    </header>
  );
}
