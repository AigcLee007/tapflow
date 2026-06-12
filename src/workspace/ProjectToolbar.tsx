import React from "react";
import { Grid2X2, List, Plus, RefreshCw, Search, SlidersHorizontal } from "lucide-react";

type ViewMode = "grid" | "list";

export function ProjectToolbar({
  disabled,
  onCreate,
  onRefresh,
  onShowAllChange,
  onSortChange,
  onViewModeChange,
  query,
  showAll,
  sortMode,
  viewMode,
  onQueryChange,
}: {
  disabled?: boolean;
  onCreate: () => void;
  onQueryChange: (value: string) => void;
  onRefresh: () => void;
  onShowAllChange: (value: boolean) => void;
  onSortChange: (value: "updated_desc" | "created_desc" | "name_asc") => void;
  onViewModeChange: (value: ViewMode) => void;
  query: string;
  showAll: boolean;
  sortMode: "updated_desc" | "created_desc" | "name_asc";
  viewMode: ViewMode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <label className="relative min-w-[260px] flex-1 lg:w-72 lg:flex-none">
        <Search className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={22} />
        <input
          className="h-16 w-full rounded-2xl border border-white/10 bg-[#141416] pl-14 pr-4 text-lg text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索"
          value={query}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          aria-label="显示全部"
          className={`inline-flex h-16 items-center gap-3 rounded-2xl border px-5 text-lg font-medium transition ${
            showAll
              ? "border-white/12 bg-white/[0.09] text-white"
              : "border-white/10 bg-[#141416] text-slate-300 hover:bg-white/[0.08]"
          }`}
          onClick={() => onShowAllChange(!showAll)}
          type="button"
        >
          <SlidersHorizontal size={21} />
          显示全部
        </button>

        <select
          aria-label="排序"
          className="h-16 rounded-2xl border border-white/10 bg-[#141416] px-5 text-lg text-white outline-none focus:border-cyan-300/60"
          onChange={(event) =>
            onSortChange(event.target.value as "updated_desc" | "created_desc" | "name_asc")
          }
          value={sortMode}
        >
          <option value="updated_desc">最近更新</option>
          <option value="created_desc">最近创建</option>
          <option value="name_asc">按名称</option>
        </select>

        <div className="inline-flex h-16 items-center rounded-2xl border border-white/10 bg-[#141416] p-1">
          <IconButton active={viewMode === "grid"} label="网格视图" onClick={() => onViewModeChange("grid")}>
            <Grid2X2 size={22} />
          </IconButton>
          <IconButton active={viewMode === "list"} label="列表视图" onClick={() => onViewModeChange("list")}>
            <List size={22} />
          </IconButton>
        </div>

        <button
          aria-label="刷新"
          className="grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-[#141416] text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
          disabled={disabled}
          onClick={onRefresh}
          type="button"
        >
          <RefreshCw size={22} />
        </button>

        <button
          className="inline-flex h-16 items-center gap-3 rounded-2xl bg-white px-7 text-lg font-semibold text-slate-950 transition hover:bg-cyan-100"
          onClick={onCreate}
          type="button"
        >
          <Plus size={24} />
          新建项目
        </button>
      </div>
    </div>
  );
}

function IconButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`grid h-12 w-12 place-items-center rounded-xl transition ${
        active ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"
      }`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
