import React from "react";

import type { WorkspaceProject } from "./workspaceApi";

export function WorkspaceHeader({ projects }: { projects: WorkspaceProject[] }) {
  return (
    <header className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-xs uppercase tracking-[0.24em] text-sky-300">Workspace</div>
        <h1 className="mt-2 text-3xl font-semibold text-white">Projects</h1>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Metric label="Projects" value={projects.length} />
        <Metric
          label="Updated"
          value={
            projects[0]?.updatedAt
              ? new Date(projects[0].updatedAt).toLocaleDateString()
              : "-"
          }
        />
        <Metric label="Scope" value="Tenant" />
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
