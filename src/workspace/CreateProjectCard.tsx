import React, { FormEvent, useState } from "react";
import { Loader2, Plus } from "lucide-react";

export function CreateProjectCard({
  creating,
  onCreate,
  viewMode = "grid",
}: {
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
        className={`flex rounded-lg border border-dashed border-white/20 bg-white/[0.03] p-5 text-slate-300 transition hover:border-sky-300/50 hover:bg-sky-400/10 hover:text-white ${
          viewMode === "list"
            ? "min-h-0 flex-row items-center justify-start gap-3"
            : "min-h-64 flex-col items-center justify-center gap-3"
        }`}
        onClick={() => setExpanded(true)}
        type="button"
      >
        <span className="grid h-12 w-12 place-items-center rounded-lg bg-sky-400 text-slate-950">
          <Plus size={24} />
        </span>
        <span className="text-sm font-semibold">新建项目</span>
      </button>
    );
  }

  return (
    <form
      className={`flex flex-col rounded-lg border border-sky-400/30 bg-sky-400/10 p-4 ${
        viewMode === "list" ? "min-h-0" : "min-h-64"
      }`}
      onSubmit={submit}
    >
      <div className="text-sm font-semibold text-white">新建项目</div>
      <input
        autoFocus
        className="mt-4 h-10 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-sky-300"
        disabled={creating}
        onChange={(event) => setName(event.target.value)}
        placeholder="项目名称"
        value={name}
      />
      <textarea
        className="mt-3 min-h-20 flex-1 resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-sky-300"
        disabled={creating}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="项目描述"
        value={description}
      />
      <div className="mt-4 flex gap-2">
        <button
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-sky-400 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:opacity-50"
          disabled={creating || !name.trim()}
          type="submit"
        >
          {creating ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
          创建
        </button>
        <button
          className="h-10 rounded-md border border-white/10 px-3 text-sm text-slate-300 hover:bg-white/10"
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
