import React, { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  Box,
  BookOpen,
  ChevronDown,
  CreditCard,
  ExternalLink,
  FolderKanban,
  HelpCircle,
  Home,
  LogOut,
  Shield,
  UserRound,
} from "lucide-react";

import {
  ACCOUNT_ROUTE,
  ADMIN_ROUTE,
  ASSETS_ROUTE,
  BILLING_ROUTE,
  HOME_ROUTE,
  WORKBENCH_ROUTE,
  PROMPTS_ROUTE,
  WORKSPACE_ROUTE,
} from "./routes";
import { BrandMark } from "./brand/BrandMark";
import { canAccessOperationsConsole, resolveProductRole } from "../auth/productRoles";
import { useAuth } from "../auth/useAuth";
import { getAvailableCredits } from "../billing/billingDisplay";
import { useBillingSummarySnapshot } from "../billing/useBillingSummarySnapshot";
import {
  getAdminAiRouteStats,
  listPublishedAnnouncements,
  markAnnouncementRead,
  type AdminAiRouteStats,
  type AdminAnnouncement,
} from "../admin/adminApi";
import { MenuSurface } from "../components/menu/MenuSurface";
import {
  MENU_DIVIDER_CLASS,
  MENU_ITEM_CLASS,
  MENU_ITEM_PRIMARY_CLASS,
  MENU_ITEM_SECONDARY_CLASS,
} from "../components/menu/menuStyles";
import { useDismissibleLayer } from "../components/menu/useDismissibleLayer";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const navItems = [
  { icon: Home, label: "主页", path: HOME_ROUTE },
  { icon: FolderKanban, label: "无限画布", path: WORKSPACE_ROUTE },
  { icon: Box, label: "生图工作台", path: WORKBENCH_ROUTE },
  { icon: BookOpen, label: "提示词广场", path: PROMPTS_ROUTE },
  { icon: Box, label: "素材库", path: ASSETS_ROUTE },
  { icon: CreditCard, label: "账单充值", path: BILLING_ROUTE },
];

function displayTenantName(name?: string | null) {
  if (!name) return "默认工作区";
  return name.replace(/'s Workspace$/i, " 的工作区");
}

function getInitial(displayName?: string | null, email?: string | null) {
  return (displayName || email || "U").trim().charAt(0).toUpperCase();
}

function getProductRoleLabel(role: ReturnType<typeof resolveProductRole>) {
  if (role === "super_admin") return "超级管理员";
  if (role === "admin") return "管理员";
  return "创作者";
}

function formatShellDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function routeDisplayName(route: AdminAiRouteStats["routes"][number]): string {
  return [route.modelDisplayName, route.routeLabel].filter(Boolean).join(" ") || route.routeKey || "模型线路";
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { authenticated, logout, permissions, roles, tenant, user } = useAuth();
  const accountLayer = useDismissibleLayer("workspace-shell-account");
  const [locationKey, setLocationKey] = useState(() =>
    typeof window === "undefined" ? HOME_ROUTE : `${window.location.pathname}${window.location.hash}`,
  );
  const [routeStats, setRouteStats] = useState<AdminAiRouteStats | null>(null);
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [monitorPanelOpen, setMonitorPanelOpen] = useState(false);
  const noticeLayer = useDismissibleLayer("workspace-shell-notices");
  const currentPath = typeof window === "undefined" ? WORKSPACE_ROUTE : window.location.pathname;
  const tenantName = displayTenantName(tenant?.name);
  const displayName = user?.displayName || user?.email || "用户";
  const userEmail = user?.email || "";
  const productRole = resolveProductRole({ permissions, roles });
  const canAdmin = canAccessOperationsConsole(productRole);
  const { summary: billingSummary } = useBillingSummarySnapshot(Boolean(authenticated && tenant && user));
  const availableCredits = getAvailableCredits(billingSummary);
  const hasUnreadAnnouncements = announcements.some((notice) => !notice.isRead);

  useEffect(() => {
    const handleLocationChange = () => setLocationKey(`${window.location.pathname}${window.location.hash}`);
    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("hashchange", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener("hashchange", handleLocationChange);
    };
  }, []);

  useEffect(() => {
    if (!canAdmin) {
      setRouteStats(null);
      return;
    }
    let cancelled = false;
    void getAdminAiRouteStats({ windowMinutes: 30 })
      .then((stats) => {
        if (!cancelled) setRouteStats(stats);
      })
      .catch(() => {
        if (!cancelled) setRouteStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [canAdmin, locationKey]);

  useEffect(() => {
    if (!authenticated || !tenant || !user) {
      setAnnouncements([]);
      return;
    }
    let cancelled = false;
    void listPublishedAnnouncements({ limit: 10 })
      .then((response) => {
        if (!cancelled) setAnnouncements(response.items);
      })
      .catch(() => {
        if (!cancelled) setAnnouncements([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, locationKey, tenant, user]);

  const goTo = (path: string) => {
    navigate(path);
    setLocationKey(`${window.location.pathname}${window.location.hash}`);
    accountLayer.closeLayer();
    noticeLayer.closeLayer();
    setMonitorPanelOpen(false);
  };

  const toggleNoticePanel = () => {
    const nextOpen = !noticeLayer.open;
    noticeLayer.toggle();
    if (!nextOpen) return;
    const unreadIds = announcements.filter((notice) => !notice.isRead).map((notice) => notice.id);
    if (unreadIds.length === 0) return;
    setAnnouncements((current) => current.map((notice) => ({ ...notice, isRead: true })));
    void Promise.all(unreadIds.map((id) => markAnnouncementRead(id))).catch(() => {
      void listPublishedAnnouncements({ limit: 10 })
        .then((response) => setAnnouncements(response.items))
        .catch(() => undefined);
    });
  };

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0b0b0d]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-24 max-w-[1840px] items-center justify-between gap-3 px-5">
          <button
            aria-label="返回首页"
            className="grid h-20 w-[120px] shrink-0 place-items-center rounded-[18px] text-left transition hover:bg-white/[0.06]"
            onClick={() => goTo(HOME_ROUTE)}
            type="button"
            title={tenantName}
          >
            <BrandMark size="header" showCaption={false} />
          </button>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full lg:flex xl:gap-2">
            {navItems.map((item) => {
              const active = currentPath === item.path;
              const Icon = item.icon;
              return (
                <button
                  className={`inline-flex h-11 shrink-0 whitespace-nowrap items-center gap-2 rounded-[22px] px-3.5 text-sm font-medium transition xl:h-[50px] xl:px-4 xl:text-base ${
                    active
                      ? "border border-white/10 bg-white/[0.10] text-white shadow-inner"
                      : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
                  }`}
                  key={`${item.path}-${item.label}-${locationKey}`}
                  onClick={() => goTo(item.path)}
                  type="button"
                >
                  <Icon size={22} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="relative flex min-w-0 items-center gap-4">
            <button
              aria-label="通知"
              ref={noticeLayer.triggerRef as React.RefObject<HTMLButtonElement>}
              aria-expanded={noticeLayer.open}
              className="relative hidden h-11 w-11 place-items-center rounded-full text-slate-300 transition hover:bg-white/[0.08] hover:text-white sm:grid"
              onClick={toggleNoticePanel}
              type="button"
            >
              <Bell size={22} />
              {hasUnreadAnnouncements ? (
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-[#0b0b0d] bg-cyan-300" />
              ) : null}
            </button>

            {noticeLayer.open ? (
              <MenuSurface
                ref={noticeLayer.ref as React.RefObject<HTMLDivElement>}
                className="absolute right-[156px] top-[calc(100%+14px)] w-[380px] p-4"
                role="menu"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">通知公告</div>
                  {canAdmin ? (
                    <button className="rounded border border-white/10 bg-white/[0.05] px-2 py-1 text-xs text-slate-200 hover:bg-white/[0.12]" onClick={() => goTo(`${ADMIN_ROUTE}#announcements`)} type="button">
                      管理
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
                  {announcements.map((notice) => (
                    <div className="rounded-[14px] border border-white/10 bg-white/[0.04] p-3" key={notice.id}>
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-semibold text-white">{notice.title}</div>
                        {notice.pinned ? <span className="shrink-0 rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">置顶</span> : null}
                      </div>
                      <div className="mt-1 line-clamp-3 text-xs leading-5 text-slate-300">{notice.body}</div>
                      {notice.imageUrl ? <img alt="" className="mt-3 max-h-28 w-full rounded-lg object-cover" src={notice.imageUrl} /> : null}
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                        <span>{formatShellDate(notice.publishedAt || notice.createdAt)}</span>
                        {notice.linkUrl ? (
                          <a className="inline-flex items-center gap-1 text-cyan-200 hover:text-cyan-100" href={notice.linkUrl} rel="noreferrer" target="_blank">
                            打开 <ExternalLink size={12} />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {!announcements.length ? <div className="rounded-[14px] border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-400">暂无通知公告</div> : null}
                </div>
              </MenuSurface>
            ) : null}

            {canAdmin ? (
              <div className="relative hidden lg:block">
              <button
                aria-label="模型线路监控"
                className="peer/route-monitor relative grid h-11 w-11 place-items-center rounded-full text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus:bg-white/[0.08] focus:text-white"
                onClick={() => goTo(`${ADMIN_ROUTE}#monitor`)}
                type="button"
                title="模型线路监控"
              >
                <Activity size={22} />
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-[#0b0b0d] bg-emerald-300" />
              </button>
              <div className="pointer-events-none absolute right-0 top-[calc(100%+10px)] z-50 hidden w-[520px] rounded border border-white/10 bg-[#171717] p-4 text-sm opacity-0 shadow-2xl shadow-black/40 transition peer-hover/route-monitor:block peer-hover/route-monitor:opacity-100 peer-focus/route-monitor:block peer-focus/route-monitor:opacity-100">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white">{routeStats?.summary.windowMinutes ?? 30}min</div>
                    <div className="mt-1 text-xs text-slate-400">成功率=成功调用/总调用；平均耗时=全部调用平均耗时</div>
                  </div>
                  <div className="rounded border border-white/10 bg-white/[0.05] px-2 py-1 text-xs text-slate-200">
                    查看全部
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-[minmax(0,1fr)_88px_72px_72px] gap-3 text-xs text-slate-400">
                  <div>模型线路</div>
                  <div>成功率</div>
                  <div>成功/总量</div>
                  <div className="text-right">平均耗时</div>
                </div>
                <div className="mt-2 space-y-2">
                  {(routeStats?.routes ?? []).slice(0, 8).map((route) => (
                    <div className="grid grid-cols-[minmax(0,1fr)_88px_72px_72px] items-center gap-3 text-xs" key={route.routeId ?? route.routeKey ?? routeDisplayName(route)}>
                      <div className="truncate text-white">{routeDisplayName(route)}</div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                          <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(0, Math.min(route.successRate, 100))}%` }} />
                        </span>
                        <span className="w-9 text-right font-semibold text-cyan-200">{route.successRate}%</span>
                      </div>
                      <div className="text-slate-300">{route.successfulCalls}/{route.totalCalls}</div>
                      <div className="text-right text-slate-300">{route.averageLatencyMs ?? "-"}ms</div>
                    </div>
                  ))}
                  {!routeStats?.routes.length ? (
                    <div className="rounded border border-white/10 bg-white/[0.04] p-3 text-xs text-slate-400">
                      最近 30 分钟暂无模型线路调用记录。
                    </div>
                  ) : null}
                </div>
              </div>
              </div>
            ) : null}

            <button
              ref={accountLayer.triggerRef as React.RefObject<HTMLButtonElement>}
              aria-expanded={accountLayer.open}
              aria-label={`${displayName} ${userEmail} 打开账户菜单`}
              className="inline-flex h-14 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] pl-2 pr-3 text-left transition hover:bg-white/[0.10]"
              onClick={accountLayer.toggle}
              type="button"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.10] text-sm font-semibold text-white">
                {getInitial(user?.displayName, user?.email)}
              </span>
              <ChevronDown
                size={17}
                className={`text-slate-400 transition ${accountLayer.open ? "rotate-180" : ""}`}
              />
            </button>

            {accountLayer.open ? (
              <MenuSurface
                ref={accountLayer.ref as React.RefObject<HTMLDivElement>}
                className="absolute right-0 top-[calc(100%+14px)] w-[320px] p-4"
                role="menu"
              >
                <div className="flex items-center gap-4 px-1 pb-4">
                  <span className="grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-white/[0.08] text-lg font-semibold">
                    {getInitial(user?.displayName, user?.email)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xl font-semibold text-white">{displayName}</div>
                    <div className="truncate text-sm text-slate-400">{userEmail}</div>
                  </div>
                </div>

                <div className="rounded-[22px] bg-white/[0.06] p-4">
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span>积分余额</span>
                    <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs font-semibold text-cyan-200">
                      个人钱包
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">{availableCredits?.toLocaleString() ?? "--"}</div>
                  <div className="mt-3 h-1.5 rounded-full bg-white/10">
                    <div className="h-full w-1/6 rounded-full bg-cyan-300" />
                  </div>
                  <div className="mt-3 text-xs text-slate-400">
                    身份：{getProductRoleLabel(productRole)}
                  </div>
                </div>

                <div className={MENU_DIVIDER_CLASS} />

                <div className="space-y-1">
                  <MenuItem icon={UserRound} label="账户管理" onClick={() => goTo(ACCOUNT_ROUTE)} />
                  {canAdmin ? (
                    <MenuItem
                      ariaLabel="Operations Admin Console"
                      icon={Shield}
                      label="运营后台"
                      onClick={() => goTo(ADMIN_ROUTE)}
                    />
                  ) : null}
                  <MenuItem icon={HelpCircle} label="帮助中心" onClick={() => undefined} />
                  <MenuItem
                    danger
                    icon={LogOut}
                    label="退出登录"
                    onClick={() => {
                      accountLayer.closeLayer();
                      void logout().finally(() => navigate("/login"));
                    }}
                  />
                </div>
              </MenuSurface>
            ) : null}
          </div>
        </div>

        <nav className="grid grid-cols-5 border-t border-white/8 md:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentPath === item.path;
            return (
              <button
                className={`flex h-14 flex-col items-center justify-center gap-1 text-[11px] ${
                  active ? "text-white" : "text-slate-400"
                }`}
                key={`${item.path}-${item.label}-mobile`}
                onClick={() => goTo(item.path)}
                type="button"
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[1840px] px-6 py-9">{children}</main>
    </div>
  );
}

function MenuItem({
  ariaLabel,
  danger,
  icon: Icon,
  label,
  onClick,
}: {
  ariaLabel?: string;
  danger?: boolean;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`${MENU_ITEM_CLASS} h-[38px] ${danger ? "text-red-100 hover:bg-red-500/15" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-white/[0.08]">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className={MENU_ITEM_PRIMARY_CLASS}>{label}</span>
        {danger ? <span className={MENU_ITEM_SECONDARY_CLASS}>结束当前会话</span> : null}
      </span>
    </button>
  );
}
