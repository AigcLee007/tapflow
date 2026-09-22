import React from "react";
import { getConsoleOverview, type ConsoleScope } from "../services/v2ConsoleApi";
import { buildConsoleUrl, formatConsoleCredits } from "./consoleQuery";
import { ConsoleFilters, QueryCoverage, QueryFeedback, linkClass, panelClass, useConsoleLoad, useConsoleQuery } from "./consoleUi";

export function ConsoleOverviewPage({scope}:{scope:ConsoleScope}) {
  const query = useConsoleQuery(scope);
  const state = useConsoleLoad(`overview:${scope}:${JSON.stringify(query)}`,()=>getConsoleOverview(scope,query));
  const data = state.data;
  const base = scope === "self" ? "/account" : "/admin";
  const drillQuery = data ? {...query,cursor:undefined,from:data.from,to:data.to,asOf:data.asOf} : query;
  return <div className="space-y-5">
    <header><h1 className="text-2xl font-semibold text-white">{scope === "self" ? "我的概览" : "平台概览"}</h1><p className="mt-2 text-sm text-slate-400">用量按计费账户统计，任务按发起人统计；生成结果与上游调用分别计算。</p></header>
    <ConsoleFilters scope={scope} resource="overview" query={query} base={`${base}/overview`}/>
    <QueryFeedback loading={state.loading} error={state.error} retry={state.retry}/>
    {data ? <>
      <QueryCoverage data={data}/>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        {label:"用量记录",value:data.usage.total,path:`${base}/usage`},
        {label:"生成任务",value:data.tasks.total,path:`${base}/tasks`},
        {label:"生成成功率",value:data.generation.successRate == null ? "未知" : `${(data.generation.successRate*100).toFixed(1)}%`,path:`${base}/usage`},
        {label:"实际扣费积分",value:formatConsoleCredits(data.usage.chargedCredits),path:`${base}/usage`},
      ].map(({label,value,path})=><a className={`${panelClass} hover:border-cyan-200/30`} href={buildConsoleUrl(path,drillQuery)} key={label}><span className="text-xs text-slate-500">{label}</span><div className="mt-2 break-all text-2xl font-semibold text-white">{value}</div></a>)}</div>
      <section className={panelClass}><h2 className="text-sm font-semibold text-slate-200">生成结果</h2><div className="mt-4 grid gap-3 text-sm text-slate-400 sm:grid-cols-2"><span>成功 {data.generation.succeeded} · 失败 {data.generation.failed}</span><span>取消 {data.generation.canceled} · 等待或未知 {data.generation.pendingOrUnknown}</span><span>已结算记录 {data.usage.settled}</span><span>尚无计费记录 {data.usage.unbilled}</span></div><p className="mt-4 text-xs text-slate-500">生成成功率 = 成功 ÷（成功 + 失败），不含等待、取消和状态未知的记录。</p></section>
      {scope === "platform" ? <section className={panelClass}><h2 className="text-sm font-semibold text-slate-200">上游调用</h2><div className="mt-3 flex flex-wrap gap-6 text-sm"><span className="text-slate-400">用户请求 {data.upstream?.total ?? "未知"}</span><div className="text-slate-400"><span>上游请求成功率</span>：<span className="text-white">{data.upstream?.operationCoverage === "request" && data.upstream.requestSuccessRate !== null ? `${(data.upstream.requestSuccessRate*100).toFixed(1)}%` : "未知"}</span></div><span className="text-slate-400">配置测试 {data.upstream?.adminTestTotal ?? 0}</span><div className="text-slate-400"><span>测试成功率</span>：<span className="text-white">{data.upstream?.adminTestSuccessRate == null ? "未知" : `${(data.upstream.adminTestSuccessRate*100).toFixed(1)}%`}</span></div><span className="text-slate-400">系统/助手 {data.upstream?.otherTotal ?? 0}</span></div><p className="mt-3 text-xs text-slate-500">用户调用、线路配置测试和系统/助手流量分开统计；用户请求成功率基于物理上游请求，不等同于生成成功率。</p></section> : null}
      <div className="flex flex-wrap gap-5 text-sm"><a className={linkClass} href={buildConsoleUrl(`${base}/usage`,drillQuery)}>查看使用明细</a><a className={linkClass} href={buildConsoleUrl(`${base}/tasks`,drillQuery)}>查看生成任务</a>{scope === "platform" ? <a className={linkClass} href={buildConsoleUrl("/admin/calls",drillQuery)}>查看调用日志</a> : null}</div>
      <p className="text-xs text-slate-500">部分历史字段缺失。以上数字来自服务端聚合，与列表当前页条数无关。</p>
    </> : null}
  </div>;
}
