import React from "react";
import { ArrowUpRight, CalendarDays, MoreHorizontal } from "lucide-react";

import { EntityConfirmDialog, EntityRenameDialog, WorkspaceActionMenu } from "../components/EntityActionMenu";
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
  onDelete,
  onOpen,
  onRename,
  onSelect,
  project,
  selected,
  viewMode,
}: {
  compact?: boolean;
  onDelete: (project: WorkspaceProject) => Promise<void>;
  onOpen: (project: WorkspaceProject) => void;
  onRename: (project: WorkspaceProject, name: string) => Promise<void>;
  onSelect: (project: WorkspaceProject) => void;
  project: WorkspaceProject;
  selected?: boolean;
  viewMode: "grid" | "list";
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const menuButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const coverUrl = project.coverUrl || "";
  const projectName = project.name || "项目";
  const relativeTime = formatRelativeTime(project.updatedAt);

  const menu = (
    <WorkspaceActionMenu
      items={[
        {
          key: "open",
          label: "打开",
          onSelect: () => {
            setMenuOpen(false);
            onOpen(project);
          },
        },
        {
          key: "rename",
          label: "重命名",
          onSelect: () => {
            setMenuOpen(false);
            setRenaming(true);
          },
        },
        {
          key: "select",
          label: selected ? "取消选择" : "选择",
          onSelect: () => {
            setMenuOpen(false);
            onSelect(project);
          },
        },
        { disabled: true, key: "move", label: "移动至...", onSelect: () => undefined, separatorBefore: true },
        { disabled: true, key: "share", label: "分享链接", onSelect: () => undefined },
        { disabled: true, key: "team", label: "移动至团队", onSelect: () => undefined },
        {
          danger: true,
          key: "delete",
          label: "删除",
          onSelect: () => {
            setMenuOpen(false);
            setConfirmingDelete(true);
          },
          separatorBefore: true,
        },
      ]}
      onClose={() => setMenuOpen(false)}
    />
  );

  const dialogs = (
    <>
      {renaming && (
        <EntityRenameDialog
          defaultValue={projectName}
          label="项目名称"
          onClose={() => setRenaming(false)}
          onSubmit={(name) => onRename(project, name)}
          title="重命名项目"
        />
      )}
      {confirmingDelete && (
        <EntityConfirmDialog
          body={`删除后项目会从工作空间移除。确定删除「${projectName}」吗？`}
          confirmLabel="确认删除"
          onClose={() => setConfirmingDelete(false)}
          onConfirm={() => onDelete(project)}
          title="删除项目"
        />
      )}
    </>
  );

  if (viewMode === "list") {
    return (
      <div className={`relative grid w-full grid-cols-[180px_1.2fr_1fr_1.3fr_1.2fr_76px] items-center border-b border-white/10 py-6 text-left transition hover:bg-white/[0.04] ${selected ? "bg-cyan-300/[0.06]" : ""}`}>
        <button
          className="contents text-left"
          onClick={() => onOpen(project)}
          type="button"
        >
          <div className="h-[90px] w-[136px] overflow-hidden rounded-[18px] bg-[linear-gradient(135deg,#3f3f46_0%,#2563eb_60%,#475569_100%)]">
            {coverUrl ? (
              <img alt="" className="h-full w-full object-cover" decoding="async" loading="lazy" src={coverUrl} />
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-white">{projectName}</div>
          </div>
          <div className="text-lg text-slate-300">项目</div>
          <div className="text-lg text-slate-300">{formatDateTime(project.createdAt)}</div>
          <div className="text-lg text-white">编辑于 {relativeTime}</div>
        </button>
        <div className="relative flex justify-end">
          <button
            aria-label={`管理项目 ${projectName}`}
            className="grid h-10 w-10 place-items-center rounded-full text-slate-300 transition hover:bg-white/[0.1] hover:text-white"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMenuOpen((open) => !open);
            }}
            ref={menuButtonRef}
            type="button"
          >
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && menu}
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    <article
      className={`group relative overflow-visible rounded-[20px] border ${selected ? "border-cyan-300/60 bg-cyan-300/[0.06]" : "border-white/10 bg-[#171719]"} text-left transition hover:border-white/20 hover:bg-white/[0.08] ${
        compact ? "min-h-[250px]" : "min-h-[286px]"
      }`}
    >
      <button className="block w-full text-left" onClick={() => onOpen(project)} type="button">
        <div className={`relative overflow-hidden rounded-t-[20px] bg-[linear-gradient(135deg,#374151_0%,#2563eb_50%,#111827_100%)] ${compact ? "aspect-[16/8.8]" : "aspect-[16/10.5]"}`}>
          {coverUrl ? (
            <img alt="" className="absolute inset-0 h-full w-full object-cover" decoding="async" loading="lazy" src={coverUrl} />
          ) : null}
        </div>
        <div className={compact ? "p-3.5" : "p-4"}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={compact ? "truncate text-[15px] font-semibold text-white" : "truncate text-lg font-semibold text-white"}>{projectName}</div>
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
      <div className="absolute right-3 top-3">
        <button
          aria-label={`管理项目 ${projectName}`}
          className="grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white/85 transition hover:bg-black/70 hover:text-white"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          ref={menuButtonRef}
          type="button"
        >
          <MoreHorizontal size={17} />
        </button>
        {menuOpen && menu}
      </div>
      {dialogs}
    </article>
  );
}
