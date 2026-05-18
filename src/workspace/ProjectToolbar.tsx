import React from "react";
import { Grid2X2, List, RefreshCw, Search, SlidersHorizontal } from "lucide-react";

type ViewMode = "grid" | "list";

export function ProjectToolbar({
  disabled,
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
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <label className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
        <input
          className="h-11 w-full rounded-lg border border-white/10 bg-black/25 pl-10 pr-3 text-sm text-white outline-none focus:border-sky-400"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search projects"
          value={query}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm ${
            showAll
              ? "border-sky-400/40 bg-sky-400/10 text-sky-100"
              : "border-white/10 bg-white/[0.04] text-slate-300"
          }`}
          onClick={() => onShowAllChange(!showAll)}
          type="button"
        >
          <SlidersHorizontal size={16} />
          All
        </button>

        <select
          className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-sky-400"
          onChange={(event) =>
            onSortChange(event.target.value as "updated_desc" | "created_desc" | "name_asc")
          }
          value={sortMode}
        >
          <option value="updated_desc">Updated</option>
          <option value="created_desc">Created</option>
          <option value="name_asc">Name</option>
        </select>

        <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-1">
          <IconButton active={viewMode === "grid"} label="Grid" onClick={() => onViewModeChange("grid")}>
            <Grid2X2 size={16} />
          </IconButton>
          <IconButton active={viewMode === "list"} label="List" onClick={() => onViewModeChange("list")}>
            <List size={16} />
          </IconButton>
        </div>

        <button
          className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
          disabled={disabled}
          onClick={onRefresh}
          title="Refresh"
          type="button"
        >
          <RefreshCw size={16} />
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
      className={`grid h-9 w-9 place-items-center rounded-md ${
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
