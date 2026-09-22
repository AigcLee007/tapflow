import React from "react";
import { listConsoleRecords, type ConsoleActivity, type ConsoleCall, type ConsoleRecords, type ConsoleResource, type ConsoleScope, type ConsoleTask, type ConsoleUsage } from "../services/v2ConsoleApi";
import { buildConsoleUrl, consoleNavigate, formatConsoleCredits } from "./consoleQuery";
import { ConsoleRecordDetail } from "./ConsoleRecordDetail";
import { ConsoleFilters, QueryCoverage, QueryFeedback, buttonClass, dateLabel, linkClass, panelClass, recordBase, sourceLabels, statusLabel, titles, useConsoleLoad, useConsoleQuery } from "./consoleUi";

type Props = { scope: ConsoleScope; resource: ConsoleResource; detailId?: string | null; embedded?: boolean; reloadKey?: number };
type RecordItem = ConsoleRecords[ConsoleResource];

function callKind(call: ConsoleCall): string {
  if (call.recordLevel !== "request") return "历史汇总记录";
  const operation = { generate: "生成", submit: "提交", poll: "轮询", stream: "流式" }[call.operation] ?? "操作未知";
  return `物理请求 · ${operation} · ${statusLabel(call.transportStatus)}`;
}

function RecordRow({scope,resource,item,search}:{scope:ConsoleScope;resource:ConsoleResource;item:RecordItem;search:string}) {
  if (resource === "activity") {
    const activity = item as ConsoleActivity;
    return <tr className="border-t border-white/10 text-sm text-slate-300">
      <td className="py-4 pr-4">{dateLabel(activity.createdAt)}<div className="mt-1 text-[10px] text-slate-500">{activity.id}</div></td>
      <td className="py-4 pr-4">{statusLabel(activity.entryType)}</td>
      <td className="py-4 pr-4 font-semibold text-white">{activity.direction === "debit" ? "−" : "+"}{formatConsoleCredits(activity.amountCredits)}</td>
      <td className="py-4 pr-4">{activity.usageEventId ? <a className={linkClass} href={`/account/usage/${encodeURIComponent(`usage:${activity.usageEventId}`)}`}>查看计费用量</a> : "—"}</td>
    </tr>;
  }
  const usage = item as ConsoleUsage;
  const task = item as ConsoleTask;
  const call = item as ConsoleCall;
  const source = "source" in item ? sourceLabels[item.source] ?? item.source : "上游请求";
  return <tr className="border-t border-white/10 text-sm text-slate-300">
    <td className="py-4 pr-4"><a className={`${linkClass} break-all`} href={`${recordBase(scope,resource)}/${encodeURIComponent(item.id)}${search}`}>{item.id}</a><div className="mt-1 text-xs text-slate-500">{dateLabel(item.createdAt)}</div></td>
    <td className="py-4 pr-4">{resource === "calls" ? callKind(call) : source}</td><td className="py-4 pr-4">{resource === "calls" && call.recordLevel === "request" ? `${call.attempt == null ? "请求序号未知" : `第 ${call.attempt} 次`} · ${call.httpStatus == null ? "HTTP 状态未知" : `HTTP ${call.httpStatus}`}` : statusLabel((item as ConsoleUsage).status)}</td>
    <td className="py-4 pr-4">{resource === "usage" ? formatConsoleCredits(usage.chargedCredits) : resource === "calls" ? call.latencyMs == null ? "未知" : `${call.latencyMs} ms` : dateLabel(task.finishedAt)}</td>
    <td className="py-4 pr-4">{resource === "usage" ? statusLabel(usage.billingStatus) : resource === "calls" ? call.routeLabel ?? call.routeKey ?? "未知" : task.projectId ? <a className={linkClass} href={`/projects/${encodeURIComponent(task.projectId)}`}>查看项目</a> : "—"}</td>
  </tr>;
}

function RecordsList({scope,resource,embedded,reloadKey=0}:Props) {
  const query = useConsoleQuery(scope);
  const state = useConsoleLoad(`list:${scope}:${resource}:${JSON.stringify(query)}:${reloadKey}`,()=>listConsoleRecords(scope,resource,query));
  const page = state.data;
  const base = recordBase(scope,resource);
  const headers = resource === "activity" ? ["时间 / 编号","账务事件","积分变化","关联"] : ["记录 / 时间",resource === "calls" ? "记录类型" : "来源",resource === "calls" ? "请求状态" : "状态",resource === "usage" ? "实际扣费积分" : resource === "calls" ? "延迟" : "完成时间",resource === "usage" ? "计费状态" : resource === "calls" ? "线路" : "项目"];
  const description = resource === "usage" ? scope === "self" ? "仅展示由你的个人钱包计费的用量。" : "按实际计费用户查询全站用量。" : resource === "tasks" ? scope === "self" ? "仅展示你发起且仍有资源访问权限的任务。" : "查看全站画布、工作台与创作助手任务。" : resource === "activity" ? "按服务端账本顺序显示积分变化，预留与释放单独记录。" : "调用记录与生成任务分别计数，历史操作类型可能未知。";
  return <div className="space-y-5">
    <header>{embedded ? <h2 className="text-lg font-semibold text-white">{titles[resource]}</h2> : <h1 className="text-2xl font-semibold text-white">{titles[resource]}</h1>}<p className="mt-2 text-sm text-slate-400">{description}</p></header>
    <ConsoleFilters scope={scope} resource={resource} query={query} base={base}/>
    {page ? <QueryCoverage data={page}/> : null}
    <QueryFeedback loading={state.loading} error={state.error} retry={state.retry}/>
    {page ? <section className={panelClass}>
      <div className="overflow-x-auto"><table className={`w-full text-left ${resource === "activity" ? "min-w-[600px]" : "min-w-[760px]"}`}><thead className="text-xs text-slate-500"><tr>{headers.map(label=><th className="pb-3 pr-4 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{page.items.map(item=><RecordRow key={item.id} scope={scope} resource={resource} item={item} search={window.location.search}/>)}</tbody></table>
      {!page.items.length ? <p className="py-10 text-center text-sm text-slate-500">当前范围暂无记录。可调整时间或筛选条件。</p> : null}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>本页 {page.items.length} 条，最多 {page.pageSize} 条。</span><div className="flex gap-2">
        {query.cursor ? <button className={buttonClass} type="button" onClick={()=>consoleNavigate(buildConsoleUrl(base,{...query,cursor:undefined}))}>返回第一页</button> : null}
        <button className={buttonClass} disabled={!page.hasMore || !page.nextCursor || state.loading} onClick={()=>consoleNavigate(buildConsoleUrl(base,{...query,cursor:page.nextCursor??undefined,asOf:page.asOf,from:page.from,to:page.to}))} type="button">下一页</button>
      </div></div>
    </section> : null}
  </div>;
}

export function ConsoleRecordsPage(props:Props) {
  if (props.detailId && props.resource !== "activity") return <ConsoleRecordDetail scope={props.scope} resource={props.resource} id={props.detailId}/>;
  return <RecordsList {...props}/>;
}
