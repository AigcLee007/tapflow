import React, { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ChevronDown, ChevronUp, FileUp, ImagePlus, Plus, Save, Trash2 } from "lucide-react";

import { MenuSelect } from "../components/menu/MenuSelect";
import {
  createAdminPrompt, deleteAdminPrompt, deleteAdminPromptMedia, getPromptMediaBlob, importPrompts,
  listAdminPromptMedia, listAdminPrompts, reorderAdminPrompts, setAdminPromptStatus, updateAdminPrompt,
  updateAdminPromptMediaOrder, uploadAdminPromptMedia, validatePromptImport,
  type PromptAdminInput, type PromptEntry, type PromptMedia,
} from "../services/v2PromptsApi";

const CATEGORIES = [
  ["portrait", "人像"], ["product", "产品"], ["ecommerce", "电商"], ["scene", "场景空间"],
  ["illustration", "插画动漫"], ["poster", "海报设计"], ["3d", "3D 材质"], ["video", "视频"],
].map(([value, label]) => ({ label, value }));
const STATUS_OPTIONS = [
  { label: "全部状态", value: "all" }, { label: "草稿", value: "draft" },
  { label: "已发布", value: "published" }, { label: "已归档", value: "archived" },
];
const emptyForm: PromptAdminInput = { category: "portrait", description: "", externalKey: "", promptTextEn: "", promptTextZh: "", status: "draft", tags: [], title: "" };
const inputClass = "h-9 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-cyan-300/60";
const textareaClass = "min-h-[120px] w-full rounded border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/60";

function deriveExternalKey(title: string) {
  const ascii = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return ascii || `prompt-${Date.now()}`;
}

function toForm(entry: PromptEntry): PromptAdminInput {
  return { category: entry.category, description: entry.description, externalKey: entry.externalKey, negativePrompt: entry.negativePrompt ?? undefined, promptTextEn: entry.promptTextEn ?? "", promptTextZh: entry.promptTextZh ?? "", status: entry.status, tags: entry.tags, title: entry.title };
}

function mergeVisibleOrder(items: PromptEntry[], visibleOrder: PromptEntry[], statusFilter: string): PromptEntry[] {
  if (statusFilter === "all") return visibleOrder;
  let visibleIndex = 0;
  return items.map((item) => item.status === statusFilter ? visibleOrder[visibleIndex++]! : item);
}

export function PromptLibraryPanel() {
  const [items, setItems] = useState<PromptEntry[]>([]);
  const [selected, setSelected] = useState<PromptEntry | null>(null);
  const [form, setForm] = useState<PromptAdminInput>(emptyForm);
  const [language, setLanguage] = useState<"zh" | "en">("zh");
  const [statusFilter, setStatusFilter] = useState("all");
  const [media, setMedia] = useState<PromptMedia[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importJson, setImportJson] = useState("[]");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragId = useRef<string | null>(null);

  const load = () => void listAdminPrompts().then(setItems).catch((cause) => setError(cause instanceof Error ? cause.message : "提示词加载失败"));
  useEffect(load, []);
  useEffect(() => () => Object.values(previewUrls).forEach(URL.revokeObjectURL), [previewUrls]);
  const visibleItems = useMemo(() => statusFilter === "all" ? items : items.filter((item) => item.status === statusFilter), [items, statusFilter]);
  const dirty = selected ? JSON.stringify(form) !== JSON.stringify(toForm(selected)) : JSON.stringify(form) !== JSON.stringify(emptyForm);

  const loadMedia = (promptId: string) => void listAdminPromptMedia(promptId).then(async (next) => {
    setMedia(next);
    const pairs = await Promise.all(next.map(async (item) => [item.id, URL.createObjectURL(await getPromptMediaBlob(item.id, promptId, "thumb"))] as const));
    setPreviewUrls((current) => ({ ...current, ...Object.fromEntries(pairs) }));
  }).catch((cause) => setError(cause instanceof Error ? cause.message : "效果图加载失败"));

  const select = (entry: PromptEntry) => { setSelected(entry); setForm(toForm(entry)); setLanguage(entry.promptTextZh ? "zh" : "en"); loadMedia(entry.id); };
  const change = (key: keyof PromptAdminInput, value: string | string[]) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setError(""); setMessage("");
    if (!form.promptTextZh?.trim() && !form.promptTextEn?.trim()) { setError("中文提示词和英文提示词至少填写一项。"); return; }
    const input = { ...form, externalKey: form.externalKey || deriveExternalKey(form.title), status: selected?.status ?? "draft" };
    setSaving(true);
    try {
      const entry = selected ? await updateAdminPrompt(selected.id, input) : await createAdminPrompt(input);
      setSelected(entry); setForm(toForm(entry)); setItems((current) => selected ? current.map((item) => item.id === entry.id ? entry : item) : [entry, ...current]);
      setMessage(selected?.status === "published" ? "已保存修改，提示词仍保持发布。" : "已保存草稿。");
      if (!selected) loadMedia(entry.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setSaving(false); }
  };
  const changeStatus = async (status: PromptEntry["status"]) => {
    if (!selected) return;
    try { const entry = await setAdminPromptStatus(selected.id, status); setSelected(entry); setForm(toForm(entry)); setItems((current) => current.map((item) => item.id === entry.id ? entry : item)); setMessage("状态已更新。"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "状态更新失败"); }
  };
  const removePrompt = async () => {
    if (!selected || !window.confirm(`确认永久删除“${selected.title}”？此操作不可恢复。`)) return;
    try { await deleteAdminPrompt(selected.id); setItems((current) => current.filter((item) => item.id !== selected.id)); setSelected(null); setForm(emptyForm); setMedia([]); setMessage("提示词已永久删除。"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "删除失败"); }
  };
  const movePrompt = async (id: string, direction: -1 | 1) => {
    const visibleIndex = visibleItems.findIndex((item) => item.id === id); const target = visibleIndex + direction;
    if (visibleIndex < 0 || target < 0 || target >= visibleItems.length) return;
    const reorderedVisible = [...visibleItems]; [reorderedVisible[visibleIndex], reorderedVisible[target]] = [reorderedVisible[target]!, reorderedVisible[visibleIndex]!];
    const previous = items; const next = mergeVisibleOrder(items, reorderedVisible, statusFilter); setItems(next);
    try { setItems(await reorderAdminPrompts({ promptIds: next.map((item) => item.id) })); } catch (cause) { setItems(previous); setError(cause instanceof Error ? cause.message : "排序保存失败"); }
  };
  const dropPrompt = (targetId: string) => { const sourceId = dragId.current; dragId.current = null; if (!sourceId || sourceId === targetId) return; const from = visibleItems.findIndex((item) => item.id === sourceId); const to = visibleItems.findIndex((item) => item.id === targetId); if (from < 0 || to < 0) return; const reorderedVisible = [...visibleItems]; const [moved] = reorderedVisible.splice(from, 1); reorderedVisible.splice(to, 0, moved!); const next = mergeVisibleOrder(items, reorderedVisible, statusFilter); const previous = items; setItems(next); void reorderAdminPrompts({ promptIds: next.map((item) => item.id) }).then(setItems).catch((cause) => { setItems(previous); setError(cause instanceof Error ? cause.message : "排序保存失败"); }); };
  const upload = async (files: FileList | null) => { if (!selected || !files?.length) return; const list = Array.from(files).slice(0, Math.max(0, 4 - media.length)); setUploading(true); try { for (const file of list) await uploadAdminPromptMedia(selected.id, file); await loadMedia(selected.id); setMessage("效果图已上传到提示词专用目录。"); } catch (cause) { setError(cause instanceof Error ? cause.message : "效果图上传失败"); } finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; } };
  const reorderMedia = async (index: number, direction: -1 | 1) => { if (!selected || index + direction < 0 || index + direction >= media.length) return; const next = [...media]; [next[index], next[index + direction]] = [next[index + direction]!, next[index]!]; setMedia(next); try { setMedia(await updateAdminPromptMediaOrder(selected.id, next.map((item, sortOrder) => ({ id: item.id, sortOrder })))); } catch (cause) { setError(cause instanceof Error ? cause.message : "排序保存失败"); loadMedia(selected.id); } };
  const removeMedia = async (id: string) => { if (!selected) return; try { await deleteAdminPromptMedia(selected.id, id); setMedia((current) => current.filter((item) => item.id !== id)); setMessage("效果图已删除。"); } catch (cause) { setError(cause instanceof Error ? cause.message : "删除失败"); } };
  const previewImport = async () => { try { const rows = JSON.parse(importJson) as Array<Partial<PromptAdminInput>>; const result = await validatePromptImport(rows); if (result.errors.length) { setError(result.errors.map((item) => `第 ${item.index + 1} 行: ${item.message}`).join("；")); return; } const imported = await importPrompts(rows); setMessage(`已导入 ${imported.created} 条草稿。`); load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "导入数据不是有效 JSON"); } };

  return <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
    <section className="border-r border-white/10 pr-4">
      <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold text-white">官方提示词</div><button aria-label="新建提示词" className="grid h-8 w-8 place-items-center rounded border border-white/10" onClick={() => { setSelected(null); setForm(emptyForm); setMedia([]); }} type="button"><Plus size={15} /></button></div>
      <MenuSelect fullWidth label="状态筛选" onChange={setStatusFilter} options={STATUS_OPTIONS} size="compact" value={statusFilter} />
      <div className="mt-3 space-y-2">{visibleItems.map((entry) => <div draggable key={entry.id} onDragStart={() => { dragId.current = entry.id; }} onDragOver={(event) => event.preventDefault()} onDrop={() => dropPrompt(entry.id)} className={`flex items-center rounded border ${selected?.id === entry.id ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/8 bg-black/15"}`}><button className="min-w-0 flex-1 px-3 py-2 text-left" onClick={() => select(entry)} type="button"><div className="truncate text-sm font-semibold text-white">{entry.title}</div><div className="mt-1 text-[11px] text-slate-400">{entry.category} · {entry.status}</div></button><div className="flex pr-1"><button aria-label={`上移 ${entry.title}`} className="grid h-8 w-7 place-items-center" onClick={() => void movePrompt(entry.id, -1)} type="button"><ChevronUp size={13} /></button><button aria-label={`下移 ${entry.title}`} className="grid h-8 w-7 place-items-center" onClick={() => void movePrompt(entry.id, 1)} type="button"><ChevronDown size={13} /></button></div></div>)}</div>
    </section>
    <section className="min-w-0 p-1">
      <div className="mb-4 flex items-center gap-3"><h2 className="text-lg font-semibold text-white">{selected ? "编辑提示词" : "新建提示词"}</h2>{dirty ? <span className="text-xs text-amber-200">未保存修改</span> : null}</div>
      {message ? <div className="mb-3 text-sm text-emerald-200" role="status">{message}</div> : null}{error ? <div className="mb-3 text-sm text-rose-200" role="alert">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-2"><label className="text-xs text-slate-400">标题<input aria-label="标题" className={`${inputClass} mt-1`} value={form.title} onChange={(event) => change("title", event.target.value)} /></label><div className="text-xs text-slate-400">分类<div className="mt-1"><MenuSelect fullWidth label="分类" onChange={(value) => change("category", value)} options={CATEGORIES} size="compact" value={form.category} /></div></div></div>
      <label className="mt-3 block text-xs text-slate-400">描述（选填）<textarea className={`${textareaClass} mt-1 min-h-[72px]`} value={form.description} onChange={(event) => change("description", event.target.value)} /></label>
      <div className="mt-3 flex items-center gap-2"><button aria-pressed={language === "zh"} className={`h-8 rounded px-3 text-xs font-bold ${language === "zh" ? "bg-cyan-300 text-slate-950" : "bg-white/5 text-slate-300"}`} onClick={() => setLanguage("zh")} type="button">中文{form.promptTextZh?.trim() ? " · 已填写" : ""}</button><button aria-pressed={language === "en"} className={`h-8 rounded px-3 text-xs font-bold ${language === "en" ? "bg-cyan-300 text-slate-950" : "bg-white/5 text-slate-300"}`} onClick={() => setLanguage("en")} type="button">English{form.promptTextEn?.trim() ? " · 已填写" : ""}</button><span className="text-[11px] text-slate-500">至少填写一种语言</span></div>
      {language === "zh" ? <label className="mt-2 block text-xs text-slate-400">中文提示词<textarea aria-label="中文提示词" className={`${textareaClass} mt-1`} value={form.promptTextZh ?? ""} onChange={(event) => change("promptTextZh", event.target.value)} /></label> : <label className="mt-2 block text-xs text-slate-400">English prompt<textarea aria-label="英文提示词" className={`${textareaClass} mt-1`} value={form.promptTextEn ?? ""} onChange={(event) => change("promptTextEn", event.target.value)} /></label>}
      <label className="mt-3 block text-xs text-slate-400">负面提示词（选填）<textarea aria-label="负面提示词（选填）" className={`${textareaClass} mt-1 min-h-[88px]`} value={form.negativePrompt ?? ""} onChange={(event) => change("negativePrompt", event.target.value)} /></label>
      <label className="mt-3 block text-xs text-slate-400">标签（逗号分隔）<input className={`${inputClass} mt-1`} value={form.tags.join(", ")} onChange={(event) => change("tags", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} /></label>
      <details className="mt-3 rounded border border-white/8 p-3"><summary className="cursor-pointer text-xs font-bold text-slate-300">高级设置</summary><label className="mt-3 block text-xs text-slate-500">外部唯一标识<input aria-label="外部唯一标识" className={`${inputClass} mt-1 text-slate-400`} placeholder="保存时自动生成" readOnly value={form.externalKey} /></label></details>
      <div className="mt-4 flex flex-wrap gap-2"><button className="inline-flex h-9 items-center gap-2 rounded bg-cyan-300 px-3 text-xs font-bold text-slate-950 disabled:opacity-50" disabled={saving || (Boolean(selected) && !dirty)} onClick={() => void save()} type="button"><Save size={14} />{selected ? "保存修改" : "保存草稿"}</button>{selected?.status === "draft" ? <><button className="h-9 rounded border border-emerald-300/30 px-3 text-xs font-bold text-emerald-100" onClick={() => void changeStatus("published")} type="button">发布</button><button className="h-9 rounded border border-white/15 px-3 text-xs font-bold" onClick={() => void changeStatus("archived")} type="button"><Archive className="mr-1 inline" size={13} />归档</button><button className="h-9 rounded border border-rose-300/30 px-3 text-xs font-bold text-rose-100" onClick={() => void removePrompt()} type="button"><Trash2 className="mr-1 inline" size={13} />删除</button></> : null}{selected?.status === "published" ? <><button className="h-9 rounded border border-amber-300/30 px-3 text-xs font-bold text-amber-100" onClick={() => void changeStatus("draft")} type="button">下架</button><button className="h-9 rounded border border-white/15 px-3 text-xs font-bold" onClick={() => void changeStatus("archived")} type="button"><Archive className="mr-1 inline" size={13} />归档</button></> : null}{selected?.status === "archived" ? <><button className="h-9 rounded border border-cyan-300/30 px-3 text-xs font-bold" onClick={() => void changeStatus("draft")} type="button">恢复草稿</button><button className="h-9 rounded border border-rose-300/30 px-3 text-xs font-bold text-rose-100" onClick={() => void removePrompt()} type="button">永久删除</button></> : null}</div>
      <div className="mt-6 border-t border-white/10 pt-4"><div className="flex items-center justify-between"><div><div className="text-sm font-semibold text-white">效果图</div><div className="mt-1 text-xs text-slate-500">支持 JPG/PNG/WebP，单张最大 25 MB。原图保留在提示词专用服务器目录，广场加载 WebP 预览图/缩略图；最多 4 张，不进入素材库。</div></div>{selected ? <><input accept="image/jpeg,image/png,image/webp" className="hidden" multiple onChange={(event) => void upload(event.target.files)} ref={inputRef} type="file" /><button aria-label="上传效果图" className="inline-flex h-9 items-center gap-2 rounded border border-cyan-300/30 px-3 text-xs font-bold text-cyan-100 disabled:opacity-50" disabled={uploading || media.length >= 4} onClick={() => inputRef.current?.click()} type="button"><ImagePlus size={14} />{uploading ? "上传中" : "上传效果图"}</button></> : null}</div>
        {!selected ? <div className="mt-3 rounded border border-dashed border-white/15 px-3 py-4 text-sm text-slate-400">保存草稿后可上传效果图</div> : null}{selected && !media.length ? <div className="mt-3 rounded border border-dashed border-white/15 px-3 py-4 text-sm text-slate-400">发布前请至少上传一张效果图</div> : null}
        {media.length ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{media.map((item, index) => <div className="overflow-hidden rounded border border-white/10 bg-black/20" key={item.id}><img alt={item.altText || item.originalFilename} className="h-auto w-full" src={previewUrls[item.id]} /><div className="flex h-8 items-center justify-between px-1"><button aria-label="上移效果图" disabled={index === 0} onClick={() => void reorderMedia(index, -1)} type="button"><ChevronUp size={14} /></button><button aria-label="删除效果图" className="text-rose-200" onClick={() => void removeMedia(item.id)} type="button"><Trash2 size={13} /></button><button aria-label="下移效果图" disabled={index === media.length - 1} onClick={() => void reorderMedia(index, 1)} type="button"><ChevronDown size={14} /></button></div></div>)}</div> : null}
      </div>
      <details className="mt-6 border-t border-white/10 pt-4"><summary className="cursor-pointer text-sm font-semibold text-white">JSON 导入草稿</summary><textarea className={`${textareaClass} mt-3 font-mono text-xs`} value={importJson} onChange={(event) => setImportJson(event.target.value)} /><button className="mt-3 inline-flex h-9 items-center gap-2 rounded border border-white/10 px-3 text-xs font-bold" onClick={() => void previewImport()} type="button"><FileUp size={14} />校验并导入</button></details>
    </section>
  </div>;
}
