import React from "react";

import type { WorkspaceProject } from "./workspaceApi";

export function WorkspaceHeader({ projects }: { projects: WorkspaceProject[] }) {
  return (
    <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-sm font-medium text-cyan-300">工作空间</div>
        <h2 className="mt-2 text-4xl font-semibold tracking-tight text-white">项目</h2>
      </div>
      <div className="text-sm text-slate-400">
        共 <span className="font-semibold text-white">{projects.length}</span> 个项目
      </div>
    </header>
  );
}
