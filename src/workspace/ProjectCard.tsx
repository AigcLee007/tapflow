import React, { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays, ImageOff, MoreHorizontal } from "lucide-react";

import { getAssetDownloadUrl } from "../assets/assetApi";
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
  const cover = useProjectCover(project);
  const relativeTime = formatRelativeTime(project.updatedAt);

  if (viewMode === "list") {
    return (
      <button
        className="grid w-full grid-cols-[1fr_auto] items-center gap-4 rounded-2xl border border-white/10 bg-[#171719] p-5 text-left transition hover:border-white/20 hover:bg-white/[0.07]"
        onClick={() => onOpen(project)}
        type="button"
      >
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold text-white">{project.name}</div>
          <div className="mt-1 truncate text-sm text-slate-500">{project.description || "暂无描述"}</div>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span>{relativeTime}</span>
          <ArrowUpRight size={18} />
        </div>
      </button>
    );
  }

  return (
    <button
      className={`group overflow-hidden rounded-[26px] border border-white/10 bg-[#1b1b1d] text-left transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.08] ${
        compact ? "min-h-[220px]" : "min-h-[300px]"
      }`}
      onClick={() => onOpen(project)}
      type="button"
    >
      <div className={`relative overflow-hidden bg-[linear-gradient(135deg,#374151_0%,#2563eb_50%,#111827_100%)] ${compact ? "aspect-[16/9]" : "aspect-[16/11]"}`}>
        {cover.url ? (
          <img alt="" className="absolute inset-0 h-full w-full object-cover" src={cover.url} />
        ) : cover.failed ? (
          <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,#111827_0%,#0f172a_42%,#1e293b_100%)] text-slate-400">
            <div className="flex flex-col items-center gap-2 text-xs">
              <ImageOff size={22} />
              Cover unavailable
            </div>
          </div>
        ) : null}
        <div className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-xl bg-black/35 text-white/85 opacity-90 transition group-hover:bg-black/55">
          <MoreHorizontal size={18} />
        </div>
      </div>
      <div className={compact ? "p-4" : "p-5"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xl font-semibold text-white">{project.name}</div>
            <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
              <CalendarDays size={15} />
              编辑于 {relativeTime}
            </div>
          </div>
          <ArrowUpRight className="mt-1 shrink-0 text-slate-400 transition group-hover:text-white" size={20} />
        </div>
        {!compact && (
          <div className="mt-4 truncate rounded-xl bg-black/30 px-4 py-3 text-sm font-medium text-slate-200">
            {project.description || "打开项目继续创作"}
          </div>
        )}
      </div>
    </button>
  );
}

function useProjectCover(project: WorkspaceProject) {
  const [coverUrl, setCoverUrl] = useState(project.coverUrl || "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (project.coverUrl) {
      setCoverUrl(project.coverUrl);
      setFailed(false);
      return;
    }

    if (!project.coverAssetId) {
      setCoverUrl("");
      setFailed(false);
      return;
    }

    let cancelled = false;
    setCoverUrl("");
    setFailed(false);

    void getAssetDownloadUrl(project.coverAssetId)
      .then((download) => {
        if (cancelled) return;
        setCoverUrl(download.url);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [project.coverAssetId, project.coverUrl]);

  return {
    failed,
    url: coverUrl,
  };
}
