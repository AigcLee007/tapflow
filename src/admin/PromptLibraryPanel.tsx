import React, { useEffect, useState } from "react";
import { Archive, FileUp, Plus, Save } from "lucide-react";

import {
  createAdminPrompt,
  importPrompts,
  listAdminPrompts,
  setAdminPromptStatus,
  updateAdminPrompt,
  validatePromptImport,
  type PromptAdminInput,
  type PromptEntry,
} from "../services/v2PromptsApi";

const emptyForm: PromptAdminInput = {
  category: "portrait",
  description: "",
  externalKey: "",
  promptText: "",
  sortWeight: 0,
  status: "draft",
  tags: [],
  title: "",
};

const inputClass = "h-9 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-cyan-300/60";
const textareaClass = "min-h-[88px] w-full rounded border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/60";

export function PromptLibraryPanel() {
  const [items, setItems] = useState<PromptEntry[]>([]);
  const [selected, setSelected] = useState<PromptEntry | null>(null);
  const [form, setForm] = useState<PromptAdminInput>(emptyForm);
  const [importJson, setImportJson] = useState("[]");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = () => void listAdminPrompts().then(setItems).catch((cause) => setError(cause instanceof Error ? cause.message : "提示词加载失败"));
  useEffect(load, []);

  const select = (entry: PromptEntry) => {
    setSelected(entry);
    setForm({
      category: entry.category, description: entry.description, externalKey: entry.externalKey,
      negativePrompt: entry.negativePrompt ?? undefined, promptText: entry.promptText,
      sortWeight: entry.sortWeight, status: entry.status, tags: entry.tags, title: entry.title,
    });
  };
  const change = (key: keyof PromptAdminInput, value: string | number | string[]) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setError(""); setMessage("");
    const input = { ...form, externalKey: form.externalKey || form.title.trim().toLowerCase().replace(/\s+/g, "-") };
    try {
      const entry = selected ? await updateAdminPrompt(selected.id, input) : await createAdminPrompt(input);
      setSelected(entry); setForm({ ...input, externalKey: entry.externalKey ?? input.externalKey }); setMessage("已保存提示词。"); load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
  };
  const changeStatus = async (status: PromptEntry["status"]) => {
    if (!selected) return;
    try { const entry = await setAdminPromptStatus(selected.id, status); setSelected(entry); setForm((current) => ({ ...current, status })); setMessage("状态已更新。"); load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "状态更新失败"); }
  };
  const previewImport = async () => {
    try {
      const rows = JSON.parse(importJson) as Array<Partial<PromptAdminInput>>;
      const result = await validatePromptImport(rows);
      if (result.errors.length) { setError(result.errors.map((item) => `第 ${item.index + 1} 行: ${item.message}`).join("；")); return; }
      const imported = await importPrompts(rows); setMessage(`已导入 ${imported.created} 条草稿。`); load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "导入数据不是有效 JSON"); }
  };

  return <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold text-white">官方提示词</div><button className="grid h-8 w-8 place-items-center rounded border border-white/10 text-slate-200 hover:bg-white/10" onClick={() => { setSelected(null); setForm(emptyForm); }} title="新建提示词" type="button"><Plus size={15} /></button></div>
      <div className="space-y-2">{items.map((entry) => <button className={`w-full rounded border px-3 py-2 text-left ${selected?.id === entry.id ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/8 bg-black/15 hover:bg-white/[0.05]"}`} key={entry.id} onClick={() => select(entry)} type="button"><div className="truncate text-sm font-semibold text-white">{entry.title}</div><div className="mt-1 text-[11px] text-slate-400">{entry.category} · {entry.status}</div></button>)}</div>
    </section>
    <section className="rounded border border-white/10 bg-white/[0.04] p-5">
      <div className="mb-4 text-lg font-semibold text-white">{selected ? "编辑提示词" : "新建提示词"}</div>
      {message ? <div className="mb-3 text-sm text-emerald-200">{message}</div> : null}{error ? <div className="mb-3 text-sm text-rose-200">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-400">标题<input aria-label="标题" className={`${inputClass} mt-1`} value={form.title} onChange={(e) => change("title", e.target.value)} /></label>
        <label className="text-xs text-slate-400">分类<input className={`${inputClass} mt-1`} value={form.category} onChange={(e) => change("category", e.target.value)} /></label>
        <label className="text-xs text-slate-400">外部键<input className={`${inputClass} mt-1`} value={form.externalKey} onChange={(e) => change("externalKey", e.target.value)} /></label>
        <label className="text-xs text-slate-400">排序权重<input className={`${inputClass} mt-1`} type="number" value={form.sortWeight ?? 0} onChange={(e) => change("sortWeight", Number(e.target.value) || 0)} /></label>
      </div>
      <label className="mt-3 block text-xs text-slate-400">描述<textarea className={`${textareaClass} mt-1`} value={form.description} onChange={(e) => change("description", e.target.value)} /></label>
      <label className="mt-3 block text-xs text-slate-400">提示词<textarea aria-label="提示词" className={`${textareaClass} mt-1`} value={form.promptText} onChange={(e) => change("promptText", e.target.value)} /></label>
      <label className="mt-3 block text-xs text-slate-400">标签（逗号分隔）<input className={`${inputClass} mt-1`} value={form.tags.join(", ")} onChange={(e) => change("tags", e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} /></label>
      <div className="mt-4 flex flex-wrap gap-2"><button className="inline-flex h-9 items-center gap-2 rounded bg-cyan-300 px-3 text-xs font-bold text-slate-950" onClick={() => void save()} type="button"><Save size={14} />保存草稿</button>{selected ? <><button className="inline-flex h-9 items-center gap-2 rounded border border-emerald-300/30 px-3 text-xs font-bold text-emerald-100" onClick={() => void changeStatus("published")} type="button">发布</button><button className="inline-flex h-9 items-center gap-2 rounded border border-amber-300/30 px-3 text-xs font-bold text-amber-100" onClick={() => void changeStatus("archived")} type="button"><Archive size={14} />归档</button></> : null}</div>
      <details className="mt-6 border-t border-white/10 pt-4"><summary className="cursor-pointer text-sm font-semibold text-white">JSON 导入草稿</summary><textarea className={`${textareaClass} mt-3 font-mono text-xs`} value={importJson} onChange={(e) => setImportJson(e.target.value)} /><button className="mt-3 inline-flex h-9 items-center gap-2 rounded border border-white/10 px-3 text-xs font-bold text-slate-100" onClick={() => void previewImport()} type="button"><FileUp size={14} />校验并导入</button></details>
    </section>
  </div>;
}
