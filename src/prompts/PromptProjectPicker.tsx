import React, { useEffect, useState } from "react";
import { FolderKanban, LoaderCircle, X } from "lucide-react";

import { listWorkspaceProjects, type WorkspaceProject } from "../workspace/workspaceApi";

export function PromptProjectPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (project: WorkspaceProject) => void;
}) {
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void listWorkspaceProjects()
      .then((items) => {
        if (!cancelled) setProjects(items);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "项目加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="选择项目">
      <div className="w-full max-w-lg rounded border border-white/10 bg-[#12151d] p-4 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-white">选择要引用到的项目</div>
            <div className="mt-1 text-[11px] text-slate-400">将创建一个新的图片生成节点，不会覆盖现有节点。</div>
          </div>
          <button aria-label="关闭" className="grid h-8 w-8 place-items-center rounded text-slate-400 hover:bg-white/[0.08] hover:text-white" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto">
          {loading ? <div className="grid min-h-28 place-items-center text-slate-400"><LoaderCircle className="animate-spin" size={20} /></div> : null}
          {error ? <div className="rounded border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</div> : null}
          {!loading && !error && projects.length === 0 ? (
            <div className="rounded border border-dashed border-white/12 p-5 text-center text-sm text-slate-400">当前工作区还没有项目。</div>
          ) : null}
          {projects.map((project) => (
            <button
              className="flex w-full items-center gap-3 rounded border border-white/8 bg-white/[0.025] p-3 text-left transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
              key={project.id}
              onClick={() => onSelect(project)}
              type="button"
            >
              <span className="grid h-9 w-9 place-items-center rounded bg-cyan-300/10 text-cyan-100"><FolderKanban size={17} /></span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold text-white">{project.name}</span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-400">{project.description || "默认画布"}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
