import React from "react";
import { getConsoleRecord, type ConsoleCall, type ConsoleScope, type ConsoleTask, type ConsoleTaskAttempt, type ConsoleUsage } from "../services/v2ConsoleApi";
import { buildConsoleUrl, formatConsoleCredits, type ConsoleQuery } from "./consoleQuery";
import { QueryFeedback, dateLabel, linkClass, panelClass, recordBase, sourceLabels, statusLabel, titles, useConsoleLoad } from "./consoleUi";

type DetailResource = "usage" | "tasks" | "calls";
type SafeRecord = ConsoleUsage | ConsoleTask | ConsoleCall;
type Field = [string, string | number | null | undefined];

function DetailFields({ fields }: { fields: Field[] }) {
  return <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{fields.map(([label,value]) =>
    <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-all text-sm text-slate-200">{value ?? "未知"}</dd></div>,
  )}</dl>;
}
function TaskInspection({ task }: { task: ConsoleTask }) {
  const timeline = task.timeline ?? [];
  const attempts = task.attempts ?? [];
  const diagnostics = task.diagnostics;
  return <>
    <section className={panelClass}>
      <h2 className="mb-3 text-sm font-semibold text-slate-200">任务时间线</h2>
      {timeline.length ? <ol className="space-y-3">{timeline.map(item => <li className="flex flex-wrap items-center gap-x-4 gap-y-1 border-l border-cyan-300/30 pl-3 text-sm" key={item.id}><span className="text-slate-500">{dateLabel(item.createdAt)}</span><span className="font-medium text-slate-200">{item.label}</span><span className="text-slate-400">{statusLabel(item.status)}</span>{item.attempt != null ? <span className="text-slate-500">第 {item.attempt} 次</span> : null}</li>)}</ol> : <p className="text-sm text-slate-500">暂无可用的任务事件。</p>}
    </section>
    <section className={panelClass}>
      <h2 className="mb-3 text-sm font-semibold text-slate-200">上游请求尝试</h2>
      {attempts.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="pb-3 pr-4">时间 / 操作</th><th className="pb-3 pr-4">状态</th><th className="pb-3 pr-4">连接 / 上游模型</th><th className="pb-3 pr-4">请求标识</th><th className="pb-3">诊断</th></tr></thead><tbody>{attempts.map((attempt: ConsoleTaskAttempt) => <tr className="border-t border-white/10 text-slate-300" key={attempt.id}><td className="py-3 pr-4"><div>{dateLabel(attempt.createdAt)}</div><div className="mt-1 text-xs text-slate-500">{attempt.operation} · {attempt.attempt == null ? "序号未知" : `第 ${attempt.attempt} 次`}</div></td><td className="py-3 pr-4">{statusLabel(attempt.transportStatus)}{attempt.httpStatus != null ? ` · HTTP ${attempt.httpStatus}` : ""}</td><td className="py-3 pr-4"><div>{attempt.connectionName ?? "连接未知"}</div><div className="mt-1 text-xs text-slate-500">{attempt.upstreamModel ?? "上游模型未知"}</div></td><td className="py-3 pr-4 text-xs"><div>请求 {attempt.providerRequestId ?? "未知"}</div><div className="mt-1">任务 {attempt.providerTaskId ?? "未知"}</div><div className="mt-1">Trace {attempt.traceId ?? "未知"}</div></td><td className="py-3">{attempt.errorCode ?? "—"}{attempt.latencyMs != null ? ` · ${attempt.latencyMs} ms` : ""}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">暂无物理上游请求记录；历史汇总不能替代请求尝试。</p>}
    </section>
    {diagnostics ? <section className={panelClass}><h2 className="mb-3 text-sm font-semibold text-slate-200">诊断索引</h2><dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><div><dt className="text-xs text-slate-500">发起用户</dt><dd className="mt-1 break-all text-sm text-slate-200">{diagnostics.actorUserId ?? "未知"}</dd></div><div><dt className="text-xs text-slate-500">计费用户</dt><dd className="mt-1 break-all text-sm text-slate-200">{diagnostics.billedUserId ?? "未知"}</dd></div><div><dt className="text-xs text-slate-500">Trace ID</dt><dd className="mt-1 break-all text-sm text-slate-200">{diagnostics.traceIds.join(", ") || "未知"}</dd></div><div><dt className="text-xs text-slate-500">Provider 请求 ID</dt><dd className="mt-1 break-all text-sm text-slate-200">{diagnostics.providerRequestIds.join(", ") || "未知"}</dd></div><div><dt className="text-xs text-slate-500">Provider 任务 ID</dt><dd className="mt-1 break-all text-sm text-slate-200">{diagnostics.providerTaskIds.join(", ") || "未知"}</dd></div><div><dt className="text-xs text-slate-500">错误码</dt><dd className="mt-1 break-all text-sm text-slate-200">{diagnostics.errorCodes.join(", ") || "未知"}</dd></div></dl></section> : null}
  </>;
}

function detailFields(resource: DetailResource, item: SafeRecord): Field[] {
  const common: Field[] = [["记录编号",item.id],["创建时间",dateLabel(item.createdAt)],["状态",statusLabel(item.status)]];
  if (resource === "usage") {
    const usage = item as ConsoleUsage;
    return [...common,["来源",sourceLabels[usage.source]],["生成状态",statusLabel(usage.executionStatus)],
      ["计费状态",statusLabel(usage.billingStatus)],["实际扣费积分",formatConsoleCredits(usage.chargedCredits)],
      ["类型",usage.modality],["数量",usage.quantity],["计量单位",usage.unit],["输入 Token",usage.inputTokens],["输出 Token",usage.outputTokens]];
  }
  if (resource === "tasks") {
    const task = item as ConsoleTask;
    const duration = task.startedAt && task.finishedAt ? Math.max(0,Date.parse(task.finishedAt)-Date.parse(task.startedAt)) : null;
    return [...common,["来源",sourceLabels[task.source]],["开始时间",dateLabel(task.startedAt)],["完成时间",dateLabel(task.finishedAt)],
      ["耗时",duration === null ? "未知" : `${(duration/1000).toFixed(1)} 秒`]];
  }
  const call = item as ConsoleCall;
  const operation = {generate:"生成",submit:"提交",poll:"轮询",stream:"流式"}[call.operation] ?? "未知";
  const trafficClass = {user_generation:"用户生成",admin_test:"线路测试",agent_control:"助手控制",system:"系统",test:"线路测试"}[call.trafficClass ?? ""] ?? call.trafficClass ?? "未知";
  return [...common,["记录类型",call.recordLevel === "request" ? "物理上游请求" : "历史汇总记录"],["产品模型",call.productModelKey],["线路",call.routeLabel ?? call.routeKey],
    ["请求操作",operation],["流量类型",trafficClass],["请求序号",call.attempt == null ? null : `第 ${call.attempt} 次`],["HTTP 状态",call.httpStatus == null ? null : String(call.httpStatus)],["传输状态",call.transportStatus ? statusLabel(call.transportStatus) : null],["执行编号",call.executionId],["延迟",call.latencyMs == null ? null : `${call.latencyMs} ms`],
    ["输入 Token",call.inputTokens],["输出 Token",call.outputTokens]];
}

function dayWindow(createdAt: string): Partial<ConsoleQuery> {
  const start = new Date(createdAt);
  start.setUTCHours(0,0,0,0);
  return {from:start.toISOString(),to:new Date(Math.min(start.getTime()+86400000-1,Date.now())).toISOString()};
}

function RelatedLinks({scope,resource,item}:{scope:ConsoleScope;resource:DetailResource;item:SafeRecord}) {
  const usage = item as ConsoleUsage;
  const task = item as ConsoleTask;
  const call = item as ConsoleCall;
  const userId = "userId" in item ? item.userId : null;
  const projectId = "projectId" in item ? item.projectId : null;
  const taskId = resource === "usage" ? usage.taskId : resource === "calls" && call.workflowRunId ? `workflow:${call.workflowRunId}` : null;
  const prefix = scope === "self" ? "/account" : "/admin";
  const modelQuery = new URLSearchParams();
  if (resource === "calls" && call.productModelKey) modelQuery.set("model",call.productModelKey);
  else if ("modelId" in item && item.modelId) modelQuery.set("modelId",item.modelId);
  if ("routeId" in item && item.routeId) modelQuery.set("route",item.routeId);
  if (resource === "usage" && ["image","text","video"].includes(usage.modality)) modelQuery.set("modality",usage.modality);
  return <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
    {taskId ? <a className={linkClass} href={`${prefix}/tasks/${encodeURIComponent(taskId)}`}>查看生成任务</a> : null}
    {scope === "self" ? <a className={linkClass} href={buildConsoleUrl("/billing",dayWindow(item.createdAt))}>查看个人账本</a> : null}
    {scope === "platform" && userId ? <a className={linkClass} href={`/admin/users/${encodeURIComponent(userId)}`}>查看用户与钱包</a> : null}
    {scope === "platform" && modelQuery.size ? <a className={linkClass} href={`/admin/models?${modelQuery}`}>查看模型线路</a> : null}
    {projectId ? <a className={linkClass} href={`/projects/${encodeURIComponent(projectId)}`}>返回项目</a> : null}
    {resource === "tasks" ? <a className={linkClass} href={buildConsoleUrl(`${prefix}/usage`,{...dayWindow(item.createdAt),source:task.source,projectId:projectId ?? undefined,...(scope === "platform" && userId ? {userId} : {})})}>查看同日相关用量</a> : null}
    {resource === "calls" && call.routeId ? <a className={linkClass} href={buildConsoleUrl("/admin/usage",{...dayWindow(item.createdAt),routeId:call.routeId})}>查看同日线路用量</a> : null}
  </div>;
}

export function ConsoleRecordDetail({scope,resource,id}:{scope:ConsoleScope;resource:DetailResource;id:string}) {
  const state = useConsoleLoad(`detail:${scope}:${resource}:${id}`,()=>getConsoleRecord(scope,resource,id));
  const item = state.data?.item;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold text-white">{titles[resource]}详情</h1><a className={linkClass} href={`${recordBase(scope,resource)}${window.location.search}`}>返回列表</a></header>
    <QueryFeedback loading={state.loading} error={state.error} retry={state.retry}/>
    {item ? <>
      <section className={panelClass}><DetailFields fields={detailFields(resource,item)}/></section>
      {resource === "tasks" ? <TaskInspection task={item as ConsoleTask}/> : null}
      <section className={panelClass}><h2 className="mb-3 text-sm font-semibold text-slate-200">关联记录</h2><RelatedLinks scope={scope} resource={resource} item={item}/></section>
      <p className="text-xs leading-6 text-slate-500">{resource === "calls" && (item as ConsoleCall).recordLevel !== "request" ? "这是历史汇总记录，不能视作一条物理上游请求。" : "历史关联和诊断信息可能不完整；未知字段不代表零值。账本与相关用量链接限定为记录当日，积分变化以个人账本为准。"}</p>
      {resource === "usage" && (item as ConsoleUsage).chargedCredits === null ? <p className="text-sm text-amber-100">此记录尚无已确认的结算积分。请结合计费状态和个人账本查看预留、释放或退款。</p> : null}
    </> : null}
  </div>;
}
