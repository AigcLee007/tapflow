import React from "react";
import { ArrowLeft, UserRound } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { hasPlatformCapability } from "../auth/productRoles";
import { MENU_ITEM_CLASS, MENU_ITEM_PRIMARY_CLASS } from "../components/menu/menuStyles";

const pages = [
  {path:"/account/overview",label:"我的概览"},
  {path:"/account/usage",label:"使用明细"},
  {path:"/account/tasks",label:"生成任务"},
  {path:"/billing",label:"个人钱包"},
  {path:"/account",label:"资料与账户"},
];
export function PersonalConsoleShell({pathname,children}:{pathname:string;children:React.ReactNode}) {
  const auth=useAuth();
  const current=pages.find(page=>page.path!=="/account"&&(pathname===page.path||pathname.startsWith(`${page.path}/`)))??pages[4];
  return <div className="min-h-screen bg-[#0b0b0d] text-slate-100">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4"><div className="flex items-center gap-3"><UserRound size={22} className="text-cyan-200"/><span className="text-lg font-semibold">个人中心</span></div><div className="flex flex-wrap gap-5 text-xs"><span className="text-slate-500">{auth.user?.displayName || auth.user?.email}</span><a className="inline-flex items-center gap-1 text-slate-200" href="/workspace"><ArrowLeft size={14}/>返回创作</a>{hasPlatformCapability(auth,"platform:console:access")?<a href="/admin/overview">管理控制台</a>:null}</div></header>
    <div className="mx-auto grid max-w-[1840px] gap-5 p-4 md:grid-cols-[210px_minmax(0,1fr)] md:p-6">
      <aside className="self-start rounded-2xl border border-white/10 bg-white/[0.025] p-2 md:sticky md:top-6"><nav aria-label="个人中心导航" className="space-y-1">{pages.map(page=><a className={`${MENU_ITEM_CLASS} h-[38px] ${current.path===page.path?"bg-white/10 text-cyan-100":"text-slate-300"}`} aria-current={current.path===page.path?"page":undefined} href={page.path} key={page.path}><span className={MENU_ITEM_PRIMARY_CLASS}>{page.label}</span></a>)}</nav></aside>
      <main className="min-w-0"><p className="mb-5 text-xs text-slate-500">个人中心 / <span className="text-slate-300">{current.label}</span></p>{children}</main>
    </div>
  </div>;
}
