import React, { useEffect, useState } from "react";
import { CalendarDays, GitBranch, ImageOff, MoreHorizontal } from "lucide-react";

import { getAssetDownloadUrl } from "../assets/assetApi";
import type { WorkspaceProject } from "./workspaceApi";

function formatRelativeTime(input: string) {
  const time = new Date(input).getTime();
  if (!Number.isFinite(time)) return "-";
  const diffMs = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "Just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} min ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)} hr ago`;
  return `${Math.floor(diffMs / day)} days ago`;
}

export function ProjectCard({
  project,
  viewMode,
  onOpen,
}: {
  onOpen: (project: WorkspaceProject) => void;
  project: WorkspaceProject;
  viewMode: "grid" | "list";
}) {
  const cover = useProjectCover(project);

  if (viewMode === "list") {
    return (
      <button
        className="grid w-full grid-cols-[1fr_auto] items-center gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-sky-300/40 hover:bg-white/[0.07]"
        onClick={() => onOpen(project)}
        type="button"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{project.name}</div>
          <div className="mt-1 truncate text-xs text-slate-500">{project.description || project.id}</div>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>{formatRelativeTime(project.updatedAt)}</span>
          <GitBranch size={15} />
        </div>
      </button>
    );
  }

  return (
    <button
      className="group overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] text-left transition hover:-translate-y-0.5 hover:border-sky-300/40 hover:bg-white/[0.07]"
      onClick={() => onOpen(project)}
      type="button"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-[linear-gradient(135deg,#0ea5e9_0%,#22c55e_48%,#111827_100%)] p-4">
        {cover.url ? (
          <img
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            src={cover.url}
          />
        ) : cover.failed ? (
          <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,#111827_0%,#0f172a_42%,#1e293b_100%)] text-slate-400">
            <div className="flex flex-col items-center gap-2 text-xs">
              <ImageOff size={20} />
              Cover unavailable
            </div>
          </div>
        ) : null}
        <div className="relative z-10 flex justify-end">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-black/25 text-white/80">
            <MoreHorizontal size={16} />
          </span>
        </div>
      </div>
      <div className="p-4">
        <div className="truncate text-sm font-semibold text-white">{project.name}</div>
        <div className="mt-2 min-h-10 text-xs leading-5 text-slate-500">
          {project.description || "No description"}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={14} />
            {formatRelativeTime(project.updatedAt)}
          </span>
          <span className="font-mono text-[11px] text-slate-600">{project.id.slice(0, 8)}</span>
        </div>
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
