import React from "react";

import type { WorkspaceProject } from "./workspaceApi";

export function WorkspaceHeader({ projects }: { projects: WorkspaceProject[] }) {
  return (
    <header className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-xs uppercase tracking-[0.24em] text-sky-300">工作区</div>
        <h1 className="mt-2 text-3xl font-semibold text-white">项目</h1>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Metric label="项目数" value={projects.length} />
        <Metric
          label="最近更新"
          value={projects[0]?.updatedAt ? new Date(projects[0].updatedAt).toLocaleDateString("zh-CN") : "-"}
        />
        <Metric label="范围" value="当前工作区" />
      </div>
    </header>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}
