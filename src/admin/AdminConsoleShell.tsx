import React, { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { resolveProductRole } from "../auth/productRoles";
import { MENU_ITEM_CLASS, MENU_ITEM_PRIMARY_CLASS } from "../components/menu/menuStyles";
import { getAdminPage, getVisibleAdminPages } from "./adminNavigation";

export function AdminConsoleShell({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const auth = useAuth();
  const pages = getVisibleAdminPages(auth);
  const currentPage = getAdminPage(pathname);
  const [openGroup, setOpenGroup] = useState(currentPage?.group ?? "概览");
  useEffect(() => { setOpenGroup(currentPage?.group ?? "概览"); }, [currentPage?.group]);
  const groups = [...new Set(pages.map((page) => page.group))];
  const role = resolveProductRole(auth);

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3"><ShieldCheck className="text-cyan-200" size={23} /><span className="text-lg font-semibold">管理控制台</span></div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <span>{role === "super_admin" ? "平台超级管理员" : role === "admin" ? "平台运营管理员" : "普通用户"}</span>
          <a className="inline-flex items-center gap-1 text-slate-200 hover:text-white" href="/workspace"><ArrowLeft size={14} />返回创作</a>
          <a className="text-slate-200 hover:text-white" href="/account">个人中心</a>
          <button className="inline-flex items-center gap-1 text-slate-200 hover:text-white" onClick={() => void auth.logout().finally(() => window.location.assign("/login"))} type="button"><LogOut size={14} />退出</button>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1840px] gap-5 p-4 md:grid-cols-[220px_minmax(0,1fr)] md:p-6">
        <aside className="self-start rounded-2xl border border-white/10 bg-white/[0.025] p-2 md:sticky md:top-6">
          <nav aria-label="管理控制台导航" className="space-y-1">
            {groups.map((group) => (
              <div key={group}>
                <button aria-expanded={openGroup === group} className={`${MENU_ITEM_CLASS} h-[38px] justify-between`} onClick={() => setOpenGroup(openGroup === group ? "" : group)} type="button">
                  <span className={MENU_ITEM_PRIMARY_CLASS}>{group}</span><ChevronDown className={openGroup === group ? "rotate-180" : ""} size={14} />
                </button>
                {openGroup === group ? <div className="space-y-1 py-1 pl-2">
                  {pages.filter((page) => page.group === group).map((page) => (
                    <a aria-current={currentPage?.path === page.path ? "page" : undefined} className={`${MENU_ITEM_CLASS} h-[38px] ${currentPage?.path === page.path ? "bg-white/10 text-cyan-100" : "text-slate-300"}`} href={page.path} key={page.path}>
                      <span className={MENU_ITEM_PRIMARY_CLASS}>{page.label}</span>
                    </a>
                  ))}
                </div> : null}
              </div>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">
          <div aria-label="当前位置" className="mb-5 text-xs text-slate-500">管理控制台 / {currentPage?.group ?? "页面"} / <span className="text-slate-300">{currentPage?.label ?? "未找到"}</span></div>
          {children}
        </main>
      </div>
    </div>
  );
}

export function AdminAccessDenied() {
  return <section className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-6 text-amber-100"><h1 className="text-lg font-semibold">无权访问此管理页面</h1><p className="mt-2 text-sm">当前账号没有此页面所需的平台权限。</p><a className="mt-4 inline-block text-sm underline" href="/account">返回个人中心</a></section>;
}
