import React, { useEffect, useState } from "react";
import { listPlatformAudit, type PlatformAuditQuery } from "./platformAuditApi";
import { buttonClass, dateLabel, panelClass, QueryFeedback, useConsoleLoad } from "../console/consoleUi";

const fields: Array<[keyof Pick<PlatformAuditQuery, "action" | "actorUserId" | "resourceId">, string]> = [["action", "操作"], ["actorUserId", "操作者 ID"], ["resourceId", "资源 ID"]];

function readQuery(): PlatformAuditQuery {
  const params = new URLSearchParams(window.location.search);
  const query: PlatformAuditQuery = { limit: 50 };
  for (const key of ["action", "actorUserId", "resourceId", "cursor", "asOf", "from", "to"] as const) {
    const value = params.get(key);
    if (value) query[key] = value;
  }
  return query;
}

function inputDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function queryDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function navigate(query: PlatformAuditQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
  window.history.pushState(null, "", `/admin/audit${params.size ? `?${params}` : ""}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function PlatformAuditPage() {
  const [query, setQuery] = useState<PlatformAuditQuery>(() => readQuery());
  const [draft, setDraft] = useState<PlatformAuditQuery>(() => readQuery());
  useEffect(() => {
    const sync = () => { const next = readQuery(); setQuery(next); setDraft(next); };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const state = useConsoleLoad(`platform-audit:${JSON.stringify(query)}`, () => listPlatformAudit(query));
  const page = state.data;
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const next = { limit: 50, action: draft.action || undefined, actorUserId: draft.actorUserId || undefined, resourceId: draft.resourceId || undefined, from: queryDate(draft.from), to: queryDate(draft.to) };
    setQuery(next);
    navigate(next);
  };
  return <div className="space-y-5">
    <header><h1 className="text-2xl font-semibold text-white">操作审计</h1><p className="mt-2 text-sm text-slate-400">记录平台管理员对用户、线路、内容和权限的关键操作。审计记录只读且不可修改。</p></header>
    <form className={panelClass} onSubmit={apply}><div className="grid gap-3 sm:grid-cols-3">{fields.map(([key,label]) => <label className="text-xs text-slate-400" key={key}>{label}<input className="mt-2 h-[38px] w-full rounded-lg border border-white/10 bg-[#17171b] px-2 text-xs text-white" placeholder="不限制" value={String(draft[key] ?? "")} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value.trim() || undefined }))}/></label>)}<label className="text-xs text-slate-400">开始时间<input aria-label="开始时间" type="datetime-local" className="mt-2 h-[38px] w-full rounded-lg border border-white/10 bg-[#17171b] px-2 text-xs text-white" value={inputDate(draft.from)} onChange={event => setDraft(current => ({ ...current, from: event.target.value || undefined }))}/></label><label className="text-xs text-slate-400">结束时间<input aria-label="结束时间" type="datetime-local" className="mt-2 h-[38px] w-full rounded-lg border border-white/10 bg-[#17171b] px-2 text-xs text-white" value={inputDate(draft.to)} onChange={event => setDraft(current => ({ ...current, to: event.target.value || undefined }))}/></label></div><p className="mt-3 text-xs text-slate-500">当前查询最多覆盖 90 天；不填写时间时默认最近 7 天。页面会保留筛选和分页范围。</p><div className="mt-4 flex gap-3"><button className={buttonClass} type="submit">应用筛选</button><button className={buttonClass} onClick={() => { const next = { limit: 50 }; setDraft(next); setQuery(next); navigate(next); }} type="button">重置</button></div></form>
    <QueryFeedback loading={state.loading} error={state.error} retry={state.retry}/>
    {page ? <section className={panelClass}><div className="mb-3 text-xs text-slate-500">覆盖范围：{dateLabel(page.from)} 至 {dateLabel(page.to)}（快照 {dateLabel(page.asOf)}）</div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead className="text-xs text-slate-500"><tr><th className="pb-3 pr-4 font-medium">时间 / 操作</th><th className="pb-3 pr-4 font-medium">资源</th><th className="pb-3 pr-4 font-medium">状态变更</th><th className="pb-3 font-medium">原因</th></tr></thead><tbody>{page.items.map(item => <tr className="border-t border-white/10 text-sm text-slate-300" key={item.id}><td className="py-4 pr-4"><div>{dateLabel(item.createdAt)}</div><div className="mt-1 font-mono text-xs text-cyan-100">{item.action}</div><div className="mt-1 text-[10px] text-slate-500">操作者 {item.actorUserId ?? "系统"}</div></td><td className="py-4 pr-4"><div>{item.resourceType}</div><div className="mt-1 break-all text-xs text-slate-500">{item.resourceId ?? "—"}</div></td><td className="py-4 pr-4">{item.statusBefore || item.statusAfter ? `${item.statusBefore ?? "未知"} → ${item.statusAfter ?? "未知"}` : "—"}</td><td className="py-4 break-words">{item.reason ?? "—"}</td></tr>)}</tbody></table>{!page.items.length ? <p className="py-10 text-center text-sm text-slate-500">当前范围暂无审计记录。</p> : null}</div><div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>本页 {page.items.length} 条，最多 {page.pageSize} 条。</span><button className={buttonClass} disabled={!page.hasMore || !page.nextCursor || state.loading} onClick={() => { const next = { ...query, cursor: page.nextCursor ?? undefined, asOf: page.asOf, from: page.from, to: page.to }; setQuery(next); navigate(next); }} type="button">下一页</button></div></section> : null}
  </div>;
}
