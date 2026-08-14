import React, { useEffect, useState } from "react";
import { Archive, FilePlus2, Loader2, Pencil, RefreshCw, Search } from "lucide-react";

import { type FlowTemplateGraph, type FlowTemplateStatus, listAdminFlowTemplates } from "../../services/v2FlowTemplatesApi";
import { MenuSelect } from "../../components/menu/MenuSelect";
import { getTemplateAdminEditorRoute, navigateTemplateAdmin } from "./templateAdminNavigation";

const STATUS_LABEL: Record<FlowTemplateStatus, string> = {
  archived: "已下架",
  draft: "草稿",
  published: "已发布",
  testing: "测试中",
};

function statusClass(status?: FlowTemplateStatus) {
  if (status === "published") return "border-emerald-300/20 bg-emerald-500/10 text-emerald-100";
  if (status === "archived") return "border-amber-300/20 bg-amber-500/10 text-amber-100";
  if (status === "testing") return "border-cyan-300/20 bg-cyan-500/10 text-cyan-100";
  return "border-white/10 bg-white/[0.06] text-slate-200";
}

export function TemplateAdminListPage() {
  const [items, setItems] = useState<FlowTemplateGraph[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FlowTemplateStatus | "all">("all");
  const load = async () => {
    setLoading(true); setError(null);
    try {
      setItems(await listAdminFlowTemplates({ query: query || undefined, status: status === "all" ? undefined : status }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "模板列表加载失败");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [status]); // query is intentionally submitted, not fetched per keystroke

  return <section className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-white">平台模板中心</h1><p className="mt-2 text-sm text-slate-400">管理官方流程模板；普通项目和工作区数据不会在此创建。</p></div>
      <button className="inline-flex h-10 items-center gap-2 rounded border border-cyan-300/30 bg-cyan-300 px-4 text-sm font-bold text-slate-950 hover:bg-cyan-200" onClick={() => navigateTemplateAdmin(`${getTemplateAdminEditorRoute("new")}`)} type="button"><FilePlus2 size={17} />新建模板</button>
    </header>
    <div className="flex flex-wrap gap-3 border-y border-white/10 py-4">
      <form className="flex min-w-[260px] flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <label className="sr-only" htmlFor="template-search">搜索模板</label><div className="relative flex-1"><Search className="absolute left-3 top-2.5 text-slate-500" size={16} /><input className="h-10 w-full rounded border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white outline-none focus:border-cyan-300/50" id="template-search" onChange={(event) => setQuery(event.target.value)} placeholder="搜索模板" value={query} /></div>
        <button className="h-10 rounded border border-white/10 px-3 text-sm text-slate-100 hover:bg-white/10" type="submit">搜索</button>
      </form>
      <MenuSelect label="模板状态" onChange={(value) => setStatus(value as FlowTemplateStatus | "all")} options={[{ label: "全部状态", value: "all" }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ label, value }))]} value={status} />
      <button aria-label="刷新模板列表" className="grid h-10 w-10 place-items-center rounded border border-white/10 text-slate-200 hover:bg-white/10" onClick={() => void load()} type="button"><RefreshCw size={16} /></button>
    </div>
    {error ? <div className="rounded border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}
    {loading ? <div className="grid min-h-48 place-items-center text-slate-400"><Loader2 className="animate-spin" size={22} /></div> : null}
    {!loading ? <div className="overflow-hidden rounded border border-white/10"><table className="w-full text-left text-sm"><thead className="bg-white/[0.04] text-xs text-slate-400"><tr><th className="px-4 py-3">模板</th><th className="px-4 py-3">分类</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">版本</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody>{items.map((item) => <tr className="border-t border-white/8" key={item.id}><td className="px-4 py-4"><div className="font-bold text-white">{item.title}</div><div className="mt-1 text-xs text-slate-500">{item.nodeCount} 个节点</div></td><td className="px-4 py-4 text-slate-300">{item.category}</td><td className="px-4 py-4"><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{STATUS_LABEL[item.status ?? "draft"]}</span></td><td className="px-4 py-4 text-slate-300">v{item.version ?? 0}</td><td className="px-4 py-4 text-right"><button aria-label={`编辑 ${item.title}`} className="inline-flex h-9 items-center gap-2 rounded border border-white/10 px-3 text-xs font-bold text-white hover:bg-white/10" onClick={() => navigateTemplateAdmin(getTemplateAdminEditorRoute(item.id))} type="button">{item.status === "archived" ? <Archive size={14} /> : <Pencil size={14} />}编辑</button></td></tr>)}{!items.length ? <tr><td className="px-4 py-12 text-center text-slate-500" colSpan={5}>暂无符合条件的模板</td></tr> : null}</tbody></table></div> : null}
  </section>;
}
