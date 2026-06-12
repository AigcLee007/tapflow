import React, { FormEvent, useState } from "react";
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
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await onCreate({
      description: description.trim() || null,
      name: name.trim(),
    });
    setName("");
    setDescription("");
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <button
        className={`group flex border border-white/10 bg-[#171719] text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] ${
          viewMode === "list"
            ? "min-h-0 flex-row items-center justify-start gap-4 rounded-2xl p-5"
            : compact
              ? "min-h-[250px] flex-col items-center justify-center gap-3 rounded-[18px] p-4"
              : "min-h-[286px] flex-col items-center justify-center gap-4 rounded-[20px] p-6"
        }`}
        data-create-project-trigger="true"
        onClick={() => setExpanded(true)}
        type="button"
      >
        <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-slate-950 transition group-hover:scale-105">
          <Plus size={26} />
        </span>
        <span className="text-base font-semibold">新建项目</span>
      </button>
    );
  }

  return (
    <form
      className={`flex flex-col border border-cyan-300/30 bg-cyan-300/10 p-5 ${
        viewMode === "list"
          ? "min-h-0 rounded-2xl"
          : compact
            ? "min-h-[250px] rounded-[18px]"
            : "min-h-[286px] rounded-[20px]"
      }`}
      onSubmit={submit}
    >
      <div className="text-lg font-semibold text-white">新建项目</div>
      <input
        autoFocus
        className="mt-4 h-11 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-cyan-300"
        disabled={creating}
        onChange={(event) => setName(event.target.value)}
        placeholder="项目名称"
        value={name}
      />
      <textarea
        className="mt-3 min-h-20 flex-1 resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300"
        disabled={creating}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="项目描述"
        value={description}
      />
      <div className="mt-4 flex gap-2">
        <button
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-slate-950 hover:bg-cyan-100 disabled:opacity-50"
          disabled={creating || !name.trim()}
          type="submit"
        >
          {creating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
          创建
        </button>
        <button
          className="h-11 rounded-xl border border-white/10 px-4 text-sm text-slate-300 hover:bg-white/10"
          disabled={creating}
          onClick={() => setExpanded(false)}
          type="button"
        >
          取消
        </button>
      </div>
    </form>
  );
}
