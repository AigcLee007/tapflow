import React, { useEffect, useMemo, useState } from "react";
import { Archive, ArrowLeft, CheckCircle2, Loader2, Save, Send, TestTube2 } from "lucide-react";

import FlowCanvasPage from "../../flowCanvas/FlowCanvasPage";
import { useFlowCanvasStore } from "../../flowCanvas/store/flowCanvasStore";
import {
  archiveAdminFlowTemplate,
  createAdminFlowTemplateDraft,
  getAdminFlowTemplate,
  validateAdminFlowTemplate,
  publishAdminFlowTemplate,
  saveAdminFlowTemplateDraft,
  type FlowTemplateGraph,
  type FlowTemplateInputDefinition,
  type FlowTemplateStatus,
} from "../../services/v2FlowTemplatesApi";
import { TEMPLATE_ADMIN_ROUTE, navigateTemplateAdmin } from "./templateAdminNavigation";

type Metadata = { title: string; description: string; category: string; estimatedCredits: string };
type InputDraft = { id: string; label: string; nodeId: string; fieldPath: string; type: FlowTemplateInputDefinition['type']; required: boolean; options: string };
const blankGraph = { nodes: [], edges: [] };
const blankMetadata: Metadata = { title: "", description: "", category: "general", estimatedCredits: "" };

function templateStatusLabel(status: FlowTemplateStatus) { return ({ archived: "已下架", draft: "草稿", published: "已发布", testing: "测试中" })[status]; }
function graphFromStore() { const state = useFlowCanvasStore.getState(); return { nodes: state.nodes, edges: state.edges }; }

export function TemplateAdminEditorPage({ templateId }: { templateId: string }) {
  const [template, setTemplate] = useState<FlowTemplateGraph | null>(null);
  const [metadata, setMetadata] = useState<Metadata>(blankMetadata);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(templateId !== "new");
  const [pending, setPending] = useState<"archive" | "publish" | "save" | "testing" | null>(null);
  const [inputDraft, setInputDraft] = useState<InputDraft>({ id: '', label: '', nodeId: '', fieldPath: 'data.generationPrompt', type: 'text', required: false, options: '' });
  const status = template?.status ?? "draft";
  const inputs = (template?.inputSchema ?? []) as FlowTemplateInputDefinition[];
  const canPublish = status === "testing";
  const canEdit = status !== "archived";

  useEffect(() => {
    let cancelled = false;
    if (templateId === "new") {
      useFlowCanvasStore.getState().loadProject({ id: "template-draft", title: "平台模板草稿", nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, version: 1 });
      setTemplate({ id: "", title: "", description: "", category: "general", nodeCount: 0, status: "draft", version: 0, graph: blankGraph, inputSchema: [] });
      setMetadata(blankMetadata); setLoading(false);
      return () => { useFlowCanvasStore.getState().newProject(); };
    }
    setLoading(true); setError(null);
    void getAdminFlowTemplate(templateId).then((next) => {
      if (cancelled) return;
      setTemplate(next); setMetadata({ title: next.title, description: next.description, category: next.category, estimatedCredits: next.estimatedCredits == null ? "" : String(next.estimatedCredits) });
      const graph = next.graph ?? blankGraph;
      // This state-only graph load deliberately leaves backend flow/project bindings unset.
      useFlowCanvasStore.getState().loadProject({ id: `template-${next.id}`, title: next.title, nodes: graph.nodes as any[], edges: graph.edges as any[], viewport: { x: 0, y: 0, zoom: 1 }, version: next.version ?? 1 });
    }).catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "模板加载失败"); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      // Never leave a template graph or template identifier in the shared canvas store.
      useFlowCanvasStore.getState().newProject();
    };
  }, [templateId]);

  const payload = useMemo(() => ({ title: metadata.title.trim(), description: metadata.description.trim(), category: metadata.category.trim() || "general", graph: graphFromStore(), inputSchema: inputs, estimatedCredits: metadata.estimatedCredits.trim() ? Number(metadata.estimatedCredits) : null }), [inputs, metadata]);
  const addInputMarker = () => {
    if (!inputDraft.id.trim() || !inputDraft.label.trim() || !inputDraft.nodeId.trim() || !inputDraft.fieldPath.trim()) { setError('请完成模板输入配置。'); return; }
    if (inputs.some((item) => item.id === inputDraft.id.trim())) { setError('模板输入 ID 已存在。'); return; }
    const enumOptions = inputDraft.options.split(',').map((option) => option.trim()).filter(Boolean);
    if (inputDraft.type === 'enum' && !enumOptions.length) { setError('枚举模板输入至少需要一个选项。'); return; }
    const next = { id: inputDraft.id.trim(), label: inputDraft.label.trim(), required: inputDraft.required, type: inputDraft.type, target: { nodeId: inputDraft.nodeId.trim(), fieldPath: inputDraft.fieldPath.trim() }, ...(inputDraft.type === 'enum' ? { options: enumOptions } : {}) } as FlowTemplateInputDefinition;
    setTemplate((current) => current ? { ...current, inputSchema: [...inputs, next] } : current);
    setInputDraft({ id: '', label: '', nodeId: '', fieldPath: 'data.generationPrompt', type: 'text', required: false, options: '' }); setError(null);
  };
  const mutate = async (action: "archive" | "publish" | "save" | "testing") => {
    setPending(action); setError(null);
    try {
      let next: FlowTemplateGraph;
      if (action === "save") next = template?.id ? await saveAdminFlowTemplateDraft(template.id, payload) : await createAdminFlowTemplateDraft(payload);
      else if (!template?.id) throw new Error("请先保存模板草稿");
      else if (action === "testing") next = await validateAdminFlowTemplate(template.id);
      else if (action === "publish") next = await publishAdminFlowTemplate(template.id);
      else next = await archiveAdminFlowTemplate(template.id);
      setTemplate((current) => ({ ...(current ?? {}), ...next, graph: next.graph ?? payload.graph, inputSchema: next.inputSchema ?? payload.inputSchema } as FlowTemplateGraph));
      if (action === "save" && !template?.id) navigateTemplateAdmin(`/admin/templates/${next.id}/editor`, true);
    } catch (mutationError) { setError(mutationError instanceof Error ? mutationError.message : "模板操作失败"); }
    finally { setPending(null); }
  };

  if (loading) return <div className="grid min-h-[460px] place-items-center text-slate-400"><Loader2 className="animate-spin" size={22} /></div>;
  if (!template) return <div className="rounded border border-red-300/20 bg-red-500/10 p-4 text-red-100">{error ?? "模板不可用"}</div>;
  return <div className="fixed inset-0 z-50 bg-[#09090f] text-slate-100">
    <header className="relative z-[70] flex min-h-[72px] items-center justify-between gap-3 border-b border-white/10 bg-[#111116] px-5">
      <div className="flex min-w-0 items-center gap-3"><button aria-label="返回模板中心" className="grid h-9 w-9 place-items-center rounded border border-white/10 hover:bg-white/10" onClick={() => navigateTemplateAdmin(TEMPLATE_ADMIN_ROUTE)} type="button"><ArrowLeft size={17} /></button><div className="min-w-0"><div className="truncate text-base font-bold">{metadata.title || "新建平台模板"}</div><div className="text-xs text-slate-400">{templateStatusLabel(status)}{template.version ? ` · 已发布版本 v${template.version}` : ""}</div></div></div>
      <div className="flex flex-wrap items-center justify-end gap-2"><button aria-label="保存草稿" className="inline-flex h-9 items-center gap-2 rounded border border-white/10 px-3 text-xs font-bold hover:bg-white/10 disabled:opacity-50" disabled={!canEdit || pending !== null || !metadata.title.trim()} onClick={() => void mutate("save")} type="button">{pending === "save" ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}保存草稿</button><button aria-label="验证模板" className="inline-flex h-9 items-center gap-2 rounded border border-cyan-300/30 px-3 text-xs font-bold text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-50" disabled={!template.id || !canEdit || pending !== null} onClick={() => void mutate("testing")} type="button"><TestTube2 size={14} />验证模板</button><button aria-label="发布模板" className="inline-flex h-9 items-center gap-2 rounded bg-cyan-300 px-3 text-xs font-bold text-slate-950 hover:bg-cyan-200 disabled:opacity-50" disabled={!canPublish || pending !== null} onClick={() => void mutate("publish")} type="button"><Send size={14} />发布模板</button>{template.id ? <button aria-label="下架模板" className="grid h-9 w-9 place-items-center rounded border border-amber-300/30 text-amber-100 hover:bg-amber-300/10 disabled:opacity-50" disabled={pending !== null || status === "archived"} onClick={() => void mutate("archive")} type="button"><Archive size={14} /></button> : null}</div>
    </header>
    <aside className="absolute left-4 top-[88px] z-[80] w-[300px] space-y-4 rounded border border-white/10 bg-[#18181d]/95 p-4 shadow-2xl"><div><label className="text-xs font-bold text-slate-300" htmlFor="template-title">模板名称</label><input className="mt-2 h-9 w-full rounded border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-cyan-300/60" disabled={!canEdit} id="template-title" onChange={(event) => setMetadata((current) => ({ ...current, title: event.target.value }))} value={metadata.title} /></div><div><label className="text-xs font-bold text-slate-300" htmlFor="template-category">分类</label><input className="mt-2 h-9 w-full rounded border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-cyan-300/60" disabled={!canEdit} id="template-category" onChange={(event) => setMetadata((current) => ({ ...current, category: event.target.value }))} value={metadata.category} /></div><div><label className="text-xs font-bold text-slate-300" htmlFor="template-description">描述</label><textarea className="mt-2 min-h-20 w-full rounded border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-cyan-300/60" disabled={!canEdit} id="template-description" onChange={(event) => setMetadata((current) => ({ ...current, description: event.target.value }))} value={metadata.description} /></div><div><label className="text-xs font-bold text-slate-300" htmlFor="template-estimated-credits">预计积分</label><input className="mt-2 h-9 w-full rounded border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-cyan-300/60" disabled={!canEdit} id="template-estimated-credits" min="0" onChange={(event) => setMetadata((current) => ({ ...current, estimatedCredits: event.target.value }))} type="number" value={metadata.estimatedCredits} /></div><div className="border-t border-white/10 pt-3 text-xs text-slate-400"><CheckCircle2 className="mr-1 inline text-cyan-200" size={13} />模板画布不会创建普通项目或 Flow。</div>{error ? <div className="rounded border border-red-300/20 bg-red-500/10 p-3 text-xs text-red-100">{error}</div> : null}</aside>
    <section className="absolute bottom-4 left-4 z-[90] w-[300px] rounded border border-white/10 bg-[#18181d]/95 p-4 shadow-2xl"><TemplateInputMarkerForm disabled={!canEdit} draft={inputDraft} inputs={inputs} onAdd={addInputMarker} onChange={(patch) => setInputDraft((current) => ({ ...current, ...patch }))} onRemove={(id) => setTemplate((current) => current ? { ...current, inputSchema: inputs.filter((item) => item.id !== id) } : current)} /></section>
    <FlowCanvasPage />
  </div>;
}

function TemplateInputMarkerForm({ disabled, draft, inputs, onAdd, onChange, onRemove }: { disabled: boolean; draft: InputDraft; inputs: FlowTemplateInputDefinition[]; onAdd: () => void; onChange: (patch: Partial<InputDraft>) => void; onRemove: (id: string) => void }) {
  return <div className="space-y-2"><div className="text-xs font-bold text-cyan-100">模板输入</div>{inputs.map((input) => <div className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1 text-[11px] text-slate-300" key={input.id}><span className="truncate">{input.label} · {input.type}</span><button aria-label={`删除 ${input.label}`} className="text-slate-500 hover:text-red-200" disabled={disabled} onClick={() => onRemove(input.id)} type="button">删除</button></div>)}<input aria-label="模板输入 ID" className="h-8 w-full rounded border border-white/10 bg-black/30 px-2 text-xs" disabled={disabled} onChange={(event) => onChange({ id: event.target.value })} placeholder="输入 ID" value={draft.id} /><input aria-label="模板输入名称" className="h-8 w-full rounded border border-white/10 bg-black/30 px-2 text-xs" disabled={disabled} onChange={(event) => onChange({ label: event.target.value })} placeholder="显示名称" value={draft.label} /><input aria-label="目标节点 ID" className="h-8 w-full rounded border border-white/10 bg-black/30 px-2 text-xs" disabled={disabled} onChange={(event) => onChange({ nodeId: event.target.value })} placeholder="节点 ID" value={draft.nodeId} /><input aria-label="字段路径" className="h-8 w-full rounded border border-white/10 bg-black/30 px-2 text-xs" disabled={disabled} onChange={(event) => onChange({ fieldPath: event.target.value })} value={draft.fieldPath} /><select aria-label="模板输入类型" className="h-8 w-full rounded border border-white/10 bg-black/30 px-2 text-xs" disabled={disabled} onChange={(event) => onChange({ type: event.target.value as InputDraft['type'] })} value={draft.type}><option value="text">文本</option><option value="asset">素材</option><option value="enum">枚举</option><option value="number">数字</option></select>{draft.type === 'enum' ? <input aria-label="枚举选项" className="h-8 w-full rounded border border-white/10 bg-black/30 px-2 text-xs" disabled={disabled} onChange={(event) => onChange({ options: event.target.value })} placeholder="选项，以逗号分隔" value={draft.options} /> : null}<label className="flex items-center gap-2 text-xs text-slate-400"><input checked={draft.required} disabled={disabled} onChange={(event) => onChange({ required: event.target.checked })} type="checkbox" />必填</label><button className="h-[38px] w-full rounded-[10px] border border-cyan-300/30 text-xs font-bold text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-50" disabled={disabled} onClick={onAdd} type="button">设为模板输入</button></div>;
}
