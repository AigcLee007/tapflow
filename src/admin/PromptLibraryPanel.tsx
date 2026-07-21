import React, { useEffect, useRef, useState } from "react";
import { Archive, ChevronDown, ChevronUp, FileUp, ImagePlus, Plus, Save, Trash2 } from "lucide-react";

import {
  createAdminPrompt,
  deleteAdminPromptMedia,
  getPromptMediaBlob,
  importPrompts,
  listAdminPromptMedia,
  listAdminPrompts,
  setAdminPromptStatus,
  updateAdminPrompt,
  updateAdminPromptMediaOrder,
  uploadAdminPromptMedia,
  validatePromptImport,
  type PromptAdminInput,
  type PromptEntry,
  type PromptMedia,
} from "../services/v2PromptsApi";

const emptyForm: PromptAdminInput = { category: "portrait", description: "", externalKey: "", promptText: "", sortWeight: 0, status: "draft", tags: [], title: "" };
const inputClass = "h-9 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-cyan-300/60";
const textareaClass = "min-h-[88px] w-full rounded border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/60";

function deriveExternalKey(title: string) {
  const ascii = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return ascii || `prompt-${Date.now()}`;
}

export function PromptLibraryPanel() {
  const [items, setItems] = useState<PromptEntry[]>([]);
  const [selected, setSelected] = useState<PromptEntry | null>(null);
  const [form, setForm] = useState<PromptAdminInput>(emptyForm);
  const [media, setMedia] = useState<PromptMedia[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [importJson, setImportJson] = useState("[]");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = () => void listAdminPrompts().then(setItems).catch((cause) => setError(cause instanceof Error ? cause.message : "提示词加载失败"));
  useEffect(load, []);
  useEffect(() => () => Object.values(previewUrls).forEach(URL.revokeObjectURL), [previewUrls]);

  const loadMedia = (promptId: string) => void listAdminPromptMedia(promptId)
    .then(async (nextMedia) => {
      setMedia(nextMedia);
      const blobs = await Promise.all(nextMedia.map(async (item) => [item.id, URL.createObjectURL(await getPromptMediaBlob(item.id, promptId))] as const));
      setPreviewUrls((current) => ({ ...current, ...Object.fromEntries(blobs) }));
    })
    .catch((cause) => setError(cause instanceof Error ? cause.message : "效果图加载失败"));

  const select = (entry: PromptEntry) => {
    setSelected(entry);
    setForm({ category: entry.category, description: entry.description, externalKey: entry.externalKey, negativePrompt: entry.negativePrompt ?? undefined, promptText: entry.promptText, sortWeight: entry.sortWeight, status: entry.status, tags: entry.tags, title: entry.title });
    loadMedia(entry.id);
  };
  const change = (key: keyof PromptAdminInput, value: string | number | string[]) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setError(""); setMessage("");
    const input = { ...form, externalKey: form.externalKey || deriveExternalKey(form.title) };
    try {
      const entry = selected ? await updateAdminPrompt(selected.id, input) : await createAdminPrompt(input);
      setSelected(entry); setForm({ ...input, externalKey: entry.externalKey ?? input.externalKey }); setMessage("已保存草稿。"); load();
      if (!selected) loadMedia(entry.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
  };
  const changeStatus = async (status: PromptEntry["status"]) => {
    if (!selected) return;
    try { const entry = await setAdminPromptStatus(selected.id, status); setSelected(entry); setForm((current) => ({ ...current, status })); setMessage("状态已更新。"); load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "状态更新失败"); }
  };
  const upload = async (files: FileList | null) => {
    if (!selected || !files?.length) return;
    const list = Array.from(files).slice(0, Math.max(0, 4 - media.length));
    if (!list.length) return;
    setUploading(true); setError("");
    try {
      for (const file of list) await uploadAdminPromptMedia(selected.id, file);
      await loadMedia(selected.id); setMessage("效果图已上传到提示词专用目录。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "效果图上传失败"); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const reorder = async (index: number, direction: -1 | 1) => {
    if (!selected || index + direction < 0 || index + direction >= media.length) return;
    const next = [...media]; [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
    const ordered = next.map((item, sortOrder) => ({ id: item.id, sortOrder }));
    setMedia(next);
    try { setMedia(await updateAdminPromptMediaOrder(selected.id, ordered)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "排序保存失败"); loadMedia(selected.id); }
  };
  const removeMedia = async (mediaId: string) => {
    if (!selected) return;
    try { await deleteAdminPromptMedia(selected.id, mediaId); setMedia((current) => current.filter((item) => item.id !== mediaId)); setMessage("效果图已删除。"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "删除失败"); }
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
      <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold text-white">官方提示词</div><button aria-label="新建提示词" className="grid h-8 w-8 place-items-center rounded border border-white/10 text-slate-200 hover:bg-white/10" onClick={() => { setSelected(null); setForm(emptyForm); setMedia([]); }} title="新建提示词" type="button"><Plus size={15} /></button></div>
      <div className="space-y-2">{items.map((entry) => <button className={`w-full rounded border px-3 py-2 text-left ${selected?.id === entry.id ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/8 bg-black/15 hover:bg-white/[0.05]"}`} key={entry.id} onClick={() => select(entry)} type="button"><div className="truncate text-sm font-semibold text-white">{entry.title}</div><div className="mt-1 text-[11px] text-slate-400">{entry.category} · {entry.status}</div></button>)}</div>
    </section>
    <section className="rounded border border-white/10 bg-white/[0.04] p-5">
      <div className="mb-4 text-lg font-semibold text-white">{selected ? "编辑提示词" : "新建提示词"}</div>
      {message ? <div className="mb-3 text-sm text-emerald-200">{message}</div> : null}{error ? <div className="mb-3 text-sm text-rose-200">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-400">标题<input aria-label="标题" className={`${inputClass} mt-1`} value={form.title} onChange={(e) => change("title", e.target.value)} /></label>
        <label className="text-xs text-slate-400">分类<input className={`${inputClass} mt-1`} value={form.category} onChange={(e) => change("category", e.target.value)} /></label>
        <label className="text-xs text-slate-400">外部唯一标识（用于导入同步）<input className={`${inputClass} mt-1`} placeholder="留空时按标题自动生成" value={form.externalKey} onChange={(e) => change("externalKey", e.target.value)} /></label>
        <label className="text-xs text-slate-400">排序权重<input className={`${inputClass} mt-1`} type="number" value={form.sortWeight ?? 0} onChange={(e) => change("sortWeight", Number(e.target.value) || 0)} /></label>
      </div>
      <label className="mt-3 block text-xs text-slate-400">描述<textarea className={`${textareaClass} mt-1`} value={form.description} onChange={(e) => change("description", e.target.value)} /></label>
      <label className="mt-3 block text-xs text-slate-400">提示词<textarea aria-label="提示词" className={`${textareaClass} mt-1`} value={form.promptText} onChange={(e) => change("promptText", e.target.value)} /></label>
      <label className="mt-3 block text-xs text-slate-400">标签（逗号分隔）<input className={`${inputClass} mt-1`} value={form.tags.join(", ")} onChange={(e) => change("tags", e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} /></label>
      <div className="mt-4 flex flex-wrap gap-2"><button className="inline-flex h-9 items-center gap-2 rounded bg-cyan-300 px-3 text-xs font-bold text-slate-950" onClick={() => void save()} type="button"><Save size={14} />保存草稿</button>{selected ? <><button className="inline-flex h-9 items-center gap-2 rounded border border-emerald-300/30 px-3 text-xs font-bold text-emerald-100" onClick={() => void changeStatus("published")} type="button">发布</button><button className="inline-flex h-9 items-center gap-2 rounded border border-amber-300/30 px-3 text-xs font-bold text-amber-100" onClick={() => void changeStatus("archived")} type="button"><Archive size={14} />归档</button></> : null}</div>
      <div className="mt-6 border-t border-white/10 pt-4"><div className="flex items-center justify-between"><div><div className="text-sm font-semibold text-white">效果图</div><div className="mt-1 text-xs text-slate-500">上传到提示词专用服务器目录，最多 4 张，不进入素材库。</div></div>{selected ? <><input accept="image/jpeg,image/png,image/webp" className="hidden" multiple onChange={(event) => void upload(event.target.files)} ref={inputRef} type="file" /><button aria-label="上传效果图" className="inline-flex h-9 items-center gap-2 rounded border border-cyan-300/30 px-3 text-xs font-bold text-cyan-100 disabled:opacity-50" disabled={uploading || media.length >= 4} onClick={() => inputRef.current?.click()} type="button"><ImagePlus size={14} />{uploading ? "上传中" : "上传效果图"}</button></> : null}</div>
        {!selected ? <div className="mt-3 rounded border border-dashed border-white/15 px-3 py-4 text-sm text-slate-400">保存草稿后可上传效果图</div> : null}
        {selected && media.length === 0 ? <div className="mt-3 rounded border border-dashed border-white/15 px-3 py-4 text-sm text-slate-400">发布前请至少上传一张效果图</div> : null}
        {media.length ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{media.map((item, index) => <div className="overflow-hidden rounded border border-white/10 bg-black/20" key={item.id}><img alt={item.altText || item.originalFilename} className="aspect-square w-full object-cover" src={previewUrls[item.id]} /><div className="flex h-8 items-center justify-between px-1"><button aria-label="上移效果图" className="grid h-7 w-7 place-items-center text-slate-300 disabled:opacity-30" disabled={index === 0} onClick={() => void reorder(index, -1)} type="button"><ChevronUp size={14} /></button><button aria-label="删除效果图" className="grid h-7 w-7 place-items-center text-rose-200" onClick={() => void removeMedia(item.id)} type="button"><Trash2 size={13} /></button><button aria-label="下移效果图" className="grid h-7 w-7 place-items-center text-slate-300 disabled:opacity-30" disabled={index === media.length - 1} onClick={() => void reorder(index, 1)} type="button"><ChevronDown size={14} /></button></div></div>)}</div> : null}
      </div>
      <details className="mt-6 border-t border-white/10 pt-4"><summary className="cursor-pointer text-sm font-semibold text-white">JSON 导入草稿</summary><textarea className={`${textareaClass} mt-3 font-mono text-xs`} value={importJson} onChange={(e) => setImportJson(e.target.value)} /><button className="mt-3 inline-flex h-9 items-center gap-2 rounded border border-white/10 px-3 text-xs font-bold text-slate-100" onClick={() => void previewImport()} type="button"><FileUp size={14} />校验并导入</button></details>
    </section>
  </div>;
}
