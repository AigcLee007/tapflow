import React, { useEffect, useState } from "react";
import {
  Bell,
  Box,
  ChevronDown,
  CreditCard,
  FolderKanban,
  HelpCircle,
  Home,
  LogOut,
  Settings,
  Shield,
  UserRound,
} from "lucide-react";

import {
  ACCOUNT_ROUTE,
  ADMIN_ROUTE,
  ASSETS_ROUTE,
  BILLING_ROUTE,
  HOME_ROUTE,
  WORKSPACE_ROUTE,
} from "./routes";
import { BrandMark } from "./brand/BrandMark";
import { useAuth } from "../auth/useAuth";
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
  { icon: FolderKanban, label: "工作空间", path: WORKSPACE_ROUTE },
  { icon: Box, label: "素材库", path: ASSETS_ROUTE },
  { icon: CreditCard, label: "价格方案", path: BILLING_ROUTE },
];

function displayTenantName(name?: string | null) {
  if (!name) return "默认工作区";
  return name.replace(/'s Workspace$/i, " 的工作区");
}

function getInitial(displayName?: string | null, email?: string | null) {
  return (displayName || email || "U").trim().charAt(0).toUpperCase();
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { logout, permissions, tenant, user } = useAuth();
  const accountLayer = useDismissibleLayer("workspace-shell-account");
  const [locationKey, setLocationKey] = useState(() =>
    typeof window === "undefined" ? HOME_ROUTE : `${window.location.pathname}${window.location.hash}`,
  );
  const currentPath = typeof window === "undefined" ? WORKSPACE_ROUTE : window.location.pathname;
  const tenantName = displayTenantName(tenant?.name);
  const displayName = user?.displayName || user?.email || "用户";
  const userEmail = user?.email || "";
  const canAdmin = permissions.includes("admin:system");

  useEffect(() => {
    const handleLocationChange = () => setLocationKey(`${window.location.pathname}${window.location.hash}`);
    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("hashchange", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener("hashchange", handleLocationChange);
    };
  }, []);

  const goTo = (path: string) => {
    navigate(path);
    setLocationKey(`${window.location.pathname}${window.location.hash}`);
    accountLayer.closeLayer();
  };

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0b0b0d]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1840px] items-center justify-between gap-4 px-6">
          <button
            aria-label={`AI Flow ${tenantName}`}
            className="flex min-w-0 items-center gap-4 text-left"
            onClick={() => goTo(HOME_ROUTE)}
            type="button"
          >
            <BrandMark size="canvas" showCaption={false} />
            <span className="min-w-0">
              <span className="block truncate text-xl font-semibold text-white">AI Flow</span>
              <span className="block truncate text-sm text-slate-500">{tenantName}</span>
            </span>
          </button>

          <nav className="hidden items-center gap-3 rounded-full md:flex">
            {navItems.map((item) => {
              const active = currentPath === item.path;
              const Icon = item.icon;
              return (
                <button
                  className={`inline-flex h-[58px] items-center gap-3 rounded-[28px] px-7 text-lg font-medium transition ${
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
              className="hidden h-11 w-11 place-items-center rounded-full text-slate-300 transition hover:bg-white/[0.08] hover:text-white sm:grid"
              type="button"
            >
              <Bell size={22} />
            </button>

            <button
              ref={accountLayer.triggerRef as React.RefObject<HTMLButtonElement>}
              aria-expanded={accountLayer.open}
              aria-label={`${displayName} ${userEmail} 打开账户菜单`}
              className="inline-flex h-14 items-center gap-3 rounded-full border border-white/10 bg-white/[0.06] pl-2 pr-4 text-left transition hover:bg-white/[0.10]"
              onClick={accountLayer.toggle}
              type="button"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.10] text-sm font-semibold text-white">
                {getInitial(user?.displayName, user?.email)}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block max-w-36 truncate text-sm font-medium text-white">{displayName}</span>
                <span className="block max-w-36 truncate text-xs text-slate-500">{userEmail}</span>
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
                      FREE
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">0</div>
                  <div className="mt-3 h-1.5 rounded-full bg-white/10">
                    <div className="h-full w-1/6 rounded-full bg-cyan-300" />
                  </div>
                </div>

                <div className={MENU_DIVIDER_CLASS} />

                <div className="space-y-1">
                  <MenuItem icon={UserRound} label="账户管理" onClick={() => goTo(ACCOUNT_ROUTE)} />
                  {canAdmin ? <MenuItem icon={Shield} label="管理后台" onClick={() => goTo(ADMIN_ROUTE)} /> : null}
                  <MenuItem icon={Settings} label="连接与模型" onClick={() => goTo("/account/ai-settings")} />
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

        <nav className="grid grid-cols-4 border-t border-white/8 md:hidden">
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
  danger,
  icon: Icon,
  label,
  onClick,
}: {
  danger?: boolean;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
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
