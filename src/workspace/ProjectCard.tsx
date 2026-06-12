import React from "react";
import { ArrowUpRight, CalendarDays, MoreHorizontal } from "lucide-react";

import type { WorkspaceProject } from "./workspaceApi";

function formatRelativeTime(input: string) {
  const time = new Date(input).getTime();
  if (!Number.isFinite(time)) return "-";
  const diffMs = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "刚刚";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} 分钟前`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)} 小时前`;
  return `${Math.floor(diffMs / day)} 天前`;
}

function formatDateTime(input: string) {
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) return "-";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ProjectCard({
  compact,
  project,
  viewMode,
  onOpen,
}: {
  compact?: boolean;
  onOpen: (project: WorkspaceProject) => void;
  project: WorkspaceProject;
  viewMode: "grid" | "list";
}) {
  const coverUrl = project.coverUrl || "";
  const relativeTime = formatRelativeTime(project.updatedAt);

  if (viewMode === "list") {
    return (
      <button
        className="grid w-full grid-cols-[180px_1.2fr_1fr_1.3fr_1.2fr] items-center border-b border-white/10 py-6 text-left transition hover:bg-white/[0.04]"
        onClick={() => onOpen(project)}
        type="button"
      >
        <div className="h-[90px] w-[136px] overflow-hidden rounded-[18px] bg-[linear-gradient(135deg,#3f3f46_0%,#2563eb_60%,#475569_100%)]">
          {coverUrl ? (
            <img alt="" className="h-full w-full object-cover" decoding="async" loading="lazy" src={coverUrl} />
          ) : null}
        </div>
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold text-white">{project.name || "项目"}</div>
        </div>
        <div className="text-lg text-slate-300">项目</div>
        <div className="text-lg text-slate-300">{formatDateTime(project.createdAt)}</div>
        <div className="flex items-center justify-between gap-4 text-lg text-white">
          <span>编辑于 {relativeTime}</span>
          <ArrowUpRight size={18} className="text-slate-500" />
        </div>
      </button>
    );
  }

  return (
    <button
      className={`group overflow-hidden rounded-[20px] border border-white/10 bg-[#171719] text-left transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.08] ${
        compact ? "min-h-[250px]" : "min-h-[286px]"
      }`}
      onClick={() => onOpen(project)}
      type="button"
    >
      <div className={`relative overflow-hidden bg-[linear-gradient(135deg,#374151_0%,#2563eb_50%,#111827_100%)] ${compact ? "aspect-[16/8.8]" : "aspect-[16/10.5]"}`}>
        {coverUrl ? (
          <img alt="" className="absolute inset-0 h-full w-full object-cover" decoding="async" loading="lazy" src={coverUrl} />
        ) : null}
        <div className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/35 text-white/85 opacity-90 transition group-hover:bg-black/55">
          <MoreHorizontal size={17} />
        </div>
      </div>
      <div className={compact ? "p-3.5" : "p-4"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={compact ? "truncate text-[15px] font-semibold text-white" : "truncate text-lg font-semibold text-white"}>{project.name}</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
              <CalendarDays size={13} />
              编辑于 {relativeTime}
            </div>
          </div>
          <ArrowUpRight className="mt-1 shrink-0 text-slate-400 transition group-hover:text-white" size={18} />
        </div>
        {!compact && (
          <div className="mt-3 truncate rounded-xl bg-black/25 px-3.5 py-2.5 text-sm font-medium text-slate-200">
            {project.description || "打开项目继续创作"}
          </div>
        )}
      </div>
    </button>
  );
}
