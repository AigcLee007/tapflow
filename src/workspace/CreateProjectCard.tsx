import React from "react";
import { Loader2, Plus } from "lucide-react";

export function CreateProjectCard({
  compact,
  creating,
  onCreate,
  viewMode = "grid",
}: {
  compact?: boolean;
  creating: boolean;
  onCreate: (input: { description?: string | null; name: string }) => Promise<void>;
  viewMode?: "grid" | "list";
}) {
  const createDefaultProject = async () => {
    if (creating) return;
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    await onCreate({
      description: null,
      name: `新项目 ${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    });
  };

  return (
    <button
      className={`group flex border border-white/10 bg-[#171719] text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60 ${
        viewMode === "list"
          ? "min-h-0 flex-row items-center justify-start gap-4 rounded-2xl p-5"
          : compact
            ? "min-h-[250px] flex-col items-center justify-center gap-3 rounded-[18px] p-4"
            : "min-h-[286px] flex-col items-center justify-center gap-4 rounded-[20px] p-6"
      }`}
      data-create-project-trigger="true"
      disabled={creating}
      onClick={() => void createDefaultProject()}
      type="button"
    >
      <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-slate-950 transition group-hover:scale-105">
        {creating ? <Loader2 className="animate-spin" size={24} /> : <Plus size={26} />}
      </span>
      <span className="text-base font-semibold">新建项目</span>
    </button>
  );
}
