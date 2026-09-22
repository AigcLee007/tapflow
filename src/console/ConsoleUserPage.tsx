import React from "react";
import { getAdminUser, listAdminUserLedger } from "../admin/adminApi";
import { MenuSelect } from "../components/menu/MenuSelect";
import { buildConsoleUrl, consoleNavigate, formatConsoleCredits } from "./consoleQuery";
import { ConsoleFilters, QueryCoverage, QueryFeedback, buttonClass, dateLabel, linkClass, panelClass, statusLabel, useConsoleLoad, useConsoleQuery } from "./consoleUi";

export function ConsoleUserPage({userId}:{userId:string}) {
  const query=useConsoleQuery("platform");
  const state=useConsoleLoad(`user:${userId}`,()=>getAdminUser(userId));
  const ledgerQuery={...query,limit:20};
  const ledgerState=useConsoleLoad(`user-ledger:${userId}:${JSON.stringify(ledgerQuery)}`,()=>listAdminUserLedger(userId,ledgerQuery));
  const user=state.data;
  const membership=user?.memberships.find(item=>item.tenantId===query.tenantId);
  const filters={userId,...(membership?{tenantId:membership.tenantId}:{})};
  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold text-white">用户详情</h1><a className={linkClass} href="/admin/users">返回用户管理</a></header>
    <QueryFeedback loading={state.loading} error={state.error} retry={state.retry}/>
    {user ? <>
      <section className={panelClass}><h2 className="text-lg font-semibold text-white">{user.displayName||"用户"}</h2><p className="mt-2 text-sm text-slate-300">{user.email}</p><p className="mt-2 break-all text-xs text-slate-500">{user.id} · {statusLabel(user.status)} · 注册于 {dateLabel(user.createdAt)}</p></section>
      <section className={panelClass}><h2 className="text-lg font-semibold text-white">个人钱包</h2><p className="mt-1 text-xs text-slate-500">钱包属于用户，不按工作区重复统计。</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{[["可用积分",user.wallet.availableCredits],["账面余额",user.wallet.balanceCredits],["预留积分",user.wallet.reservedCredits]].map(([label,value])=><div key={String(label)}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl text-white">{formatConsoleCredits(String(value))}</p></div>)}</div></section>
      <section className={panelClass}><h2 className="mb-4 text-lg font-semibold text-white">工作区关系</h2><MenuSelect label="工作区关系" fullWidth value={membership?.tenantId??""} options={[{label:"请选择工作区关系",value:""},...user.memberships.map(item=>({label:item.tenantName,value:item.tenantId}))]} onChange={tenantId=>consoleNavigate(buildConsoleUrl(`/admin/users/${encodeURIComponent(userId)}`,{tenantId:tenantId||undefined}))}/>{membership?<dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">工作区</dt><dd className="mt-1 text-white">{membership.tenantName}</dd></div><div><dt className="text-slate-500">成员身份</dt><dd className="mt-1 text-white">{membership.roleKey}</dd></div><div><dt className="text-slate-500">成员状态</dt><dd className="mt-1 text-white">{statusLabel(membership.membershipStatus)}</dd></div></dl>:<p className="mt-3 text-xs text-slate-500">未选择工作区时，关联查询涵盖该用户全部授权数据。</p>}</section>
      <div className="flex flex-wrap gap-5 text-sm"><a className={linkClass} href={buildConsoleUrl("/admin/usage",filters)}>查看用户用量</a><a className={linkClass} href={buildConsoleUrl("/admin/tasks",filters)}>查看用户任务</a></div>
      <section className={panelClass}><h2 className="text-sm font-semibold text-white">积分账本明细</h2><p className="mt-2 text-xs text-slate-500">按个人钱包查询。默认最近 7 天；可选择最长 90 天范围并继续翻页。</p><div className="mt-4"><ConsoleFilters scope="platform" resource="activity" query={ledgerQuery} base={`/admin/users/${encodeURIComponent(userId)}`}/></div>{ledgerState.data?<div className="mt-4"><QueryCoverage data={ledgerState.data}/></div>:null}<QueryFeedback loading={ledgerState.loading} error={ledgerState.error} retry={ledgerState.retry}/>{ledgerState.data?.items.length?<div className="mt-3 divide-y divide-white/10">{ledgerState.data.items.map(entry=><div className="flex flex-wrap justify-between gap-3 py-3 text-sm" key={entry.id}><span className="text-slate-400">{dateLabel(entry.createdAt)} · {statusLabel(entry.entryType)}</span><span>{entry.direction==="debit"?"−":"+"}{formatConsoleCredits(entry.amountCredits)}</span></div>)}</div>:!ledgerState.loading&&!ledgerState.error?<p className="mt-3 text-sm text-slate-500">当前范围暂无积分记录。</p>:null}{ledgerState.data?<div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>本页 {ledgerState.data.items.length} 条，最多 {ledgerState.data.pageSize} 条</span><div className="flex gap-2">{ledgerQuery.cursor?<button className={buttonClass} onClick={()=>consoleNavigate(buildConsoleUrl(`/admin/users/${encodeURIComponent(userId)}`,{...ledgerQuery,cursor:undefined}))} type="button">返回第一页</button>:null}<button className={buttonClass} disabled={!ledgerState.data.hasMore||ledgerState.loading} onClick={()=>consoleNavigate(buildConsoleUrl(`/admin/users/${encodeURIComponent(userId)}`,{...ledgerQuery,cursor:ledgerState.data?.nextCursor??undefined,asOf:ledgerState.data.asOf,from:ledgerState.data.from,to:ledgerState.data.to}))} type="button">下一页</button></div></div>:null}</section>
    </> : null}
  </div>;
}
