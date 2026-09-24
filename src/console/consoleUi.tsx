import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { MenuSelect } from "../components/menu/MenuSelect";
import type { ConsoleScope, ConsoleResource } from "../services/v2ConsoleApi";
import { buildConsoleUrl, changeConsoleFilters, consoleNavigate, readConsoleQuery, type ConsoleQuery } from "./consoleQuery";

export const panelClass = "rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5";
export const buttonClass = "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40";
export const linkClass = "text-cyan-200 underline-offset-4 hover:underline";
export const titles = {usage:"使用明细",tasks:"生成任务",calls:"AI 调用日志",activity:"账单明细"};
export const sourceLabels: Record<string,string> = {workflow:"画布",workbench:"工作台",agent:"创作助手",unknown:"来源未知"};
const statusLabels: Record<string,string> = {succeeded:"已成功",completed:"已完成",success:"已成功",failed:"失败",canceled:"已取消",cancelled:"已取消",pending:"等待中",queued:"排队中",running:"执行中",settled:"已结算",reserved:"已预留",released:"已释放",refunded:"已退款",unbilled:"尚无计费记录",unknown:"未知",ok:"正常",error:"失败",http_succeeded:"HTTP 成功",http_failed:"HTTP 失败",network_error:"网络错误",reserve:"预留积分",settle:"结算扣费",refund:"退还积分",payment_refund:"支付退款",release:"释放预留",grant:"发放积分",admin_credit:"管理发放",admin_debit:"管理扣减",admin_adjustment:"管理调整",adjustment:"管理调整",redeem:"兑换充值",payment:"支付充值",expire:"积分到期"};
export function statusLabel(value: string | null | undefined) { return value ? statusLabels[value] ?? value : "未知"; }
export function dateLabel(value: string | null | undefined) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN") : "未知"; }
export function recordBase(scope: ConsoleScope, resource: ConsoleResource) { return resource === "activity" ? "/billing" : `/${scope === "self" ? "account" : "admin"}/${resource}`; }

export function useConsoleQuery(scope: ConsoleScope) {
  const [search,setSearch] = useState(()=>window.location.search);
  useEffect(()=>{ const update=()=>setSearch(window.location.search); window.addEventListener("popstate",update);update();return ()=>window.removeEventListener("popstate",update); },[]);
  const query=useMemo(()=>readConsoleQuery(search,scope),[search,scope]);
  return query;
}

export function useConsoleLoad<T>(key: string, loader: () => Promise<T>) {
  const {user,sessionId} = useAuth();
  const identity = `${user?.id ?? "anonymous"}:${sessionId ?? "none"}`;
  const [revision,setRevision] = useState(0);
  const [state,setState] = useState<{data:T|null;error:string;loading:boolean;key:string}>({data:null,error:"",loading:true,key:""});
  const requestKey=`${identity}:${key}:${revision}`;
  useEffect(()=>{
    let cancelled=false;setState({data:null,error:"",loading:true,key:requestKey});
    loader().then(data=>{ if(!cancelled)setState({data,error:"",loading:false,key:requestKey}); })
      .catch(cause=>{ if(!cancelled)setState({data:null,error:cause instanceof Error?cause.message:"查询失败，请稍后重试。",loading:false,key:requestKey}); });
    return()=>{cancelled=true;};
  },[requestKey]);
  // Hide a previous actor/query's data before the request effect is flushed.
  return {...(state.key===requestKey ? state : {data:null,error:"",loading:true}),retry:()=>setRevision(value=>value+1)};
}

export function QueryFeedback({loading,error,retry}:{loading:boolean;error:string;retry:()=>void}) {
  if(error)return <div className={`${panelClass} text-red-200`} role="alert"><p>{error}</p><button className={`${buttonClass} mt-3`} onClick={retry} type="button">重试</button></div>;
  if(loading)return <p className="py-8 text-sm text-slate-400" role="status">正在加载记录…</p>;
  return null;
}
export function QueryCoverage({data}:{data:{scope:ConsoleScope;from:string;to:string;asOf:string}}) {
 return <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span>范围：{data.scope==="self"?"本人":"全站"}</span><span>{dateLabel(data.from)} — {dateLabel(data.to)}</span><span>数据截至 {dateLabel(data.asOf)}</span></div>;
}
function localDate(value?:string) { if(!value||!Number.isFinite(Date.parse(value)))return "";const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16); }
export function ConsoleFilters({scope,resource,query,base}:{scope:ConsoleScope;resource:ConsoleResource|"overview";query:ConsoleQuery;base:string}) {
 const [draft,setDraft]=useState(query);
 useEffect(()=>setDraft(query),[query]);
 const set=(key:keyof ConsoleQuery,value:string)=>setDraft(current=>({...current,[key]:value||undefined}));
 const fields:Array<[keyof ConsoleQuery,string]> = resource==="activity" ? [] : [
   ...(scope==="platform"?[["userId","用户 ID"],["tenantId","工作区 ID"]] as Array<[keyof ConsoleQuery,string]>:[]),
   ["projectId","项目 ID"],
   ...(resource==="usage"||resource==="calls"?[["modelId","模型 ID"],["routeId","线路 ID"]] as Array<[keyof ConsoleQuery,string]>:[]),
 ];
 const statusOptions=resource==="activity" ? ["reserve","settle","refund","payment_refund","admin_credit","admin_debit","redeem","payment","expire"] : resource==="usage" ? ["settled","reserved","released","refunded","unbilled"] : resource==="calls" ? ["http_succeeded","http_failed","network_error","cancelled","succeeded","failed","canceled"] : ["queued","running","succeeded","failed","canceled"];
 const statusKey: keyof ConsoleQuery = resource === "usage" ? "billingStatus" : "status";
 const statusLabelText = resource === "usage" ? "计费状态" : resource === "activity" ? "账务类型" : "状态";
 return <form className={panelClass} onSubmit={event=>{event.preventDefault();consoleNavigate(buildConsoleUrl(base,changeConsoleFilters(query,draft)));}}>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
     {([ ["from","开始时间"],["to","结束时间"] ] as const).map(([key,label])=><label className="text-xs text-slate-400" key={key}>{label}<input className="mt-2 h-[38px] w-full min-w-0 rounded-lg border border-white/10 bg-[#17171b] px-2 text-xs text-white [color-scheme:dark]" type="datetime-local" value={localDate(draft[key])} onChange={e=>set(key,e.target.value?new Date(e.target.value).toISOString():"")}/></label>)}
     {resource!=="overview"?<MenuSelect label={statusLabelText} fullWidth value={draft[statusKey]??""} options={[{label:"全部",value:""},...statusOptions.map(value=>({value,label:statusLabel(value)}))]} onChange={value=>set(statusKey,value)}/>:null}
     {resource!=="activity"&&resource!=="overview"?<MenuSelect label="来源" fullWidth value={draft.source??""} options={[{label:"全部来源",value:""},...Object.entries(sourceLabels).map(([value,label])=>({value,label}))]} onChange={value=>set("source",value)}/>:null}
     {resource==="calls"?<MenuSelect label="流量类型" fullWidth value={draft.trafficClass??""} options={[{label:"全部流量",value:""},{label:"用户生成",value:"user_generation"},{label:"线路测试",value:"admin_test"},{label:"助手控制",value:"agent_control"},{label:"系统",value:"system"},{label:"未知",value:"unknown"}]} onChange={value=>set("trafficClass",value)}/>:null}
     {fields.map(([key,label])=><label className="text-xs text-slate-400" key={key}>{label}<input className="mt-2 h-[38px] w-full rounded-lg border border-white/10 bg-[#17171b] px-2 text-xs text-white" placeholder="不限制" value={String(draft[key]??"")} onChange={e=>set(key,e.target.value.trim())}/></label>)}
   </div>
   <div className="mt-4 flex flex-wrap items-center gap-3"><button className={buttonClass} type="submit">应用筛选</button><button className={buttonClass} type="button" onClick={()=>consoleNavigate(base)}>重置</button><span className="text-xs text-slate-500">默认最近 7 天，单次查询最长 90 天。</span></div>
 </form>;
}
