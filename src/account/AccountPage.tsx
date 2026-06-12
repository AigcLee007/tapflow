import React from "react";
import { Activity, Boxes, Loader2, LogOut, RefreshCw, Settings2, Sparkles, UserRound } from "lucide-react";

import {
  ACCOUNT_AI_SETTINGS_ROUTE,
  ACCOUNT_INSPECTION_ROUTE,
  ACCOUNT_PROVIDER_SETTINGS_ROUTE,
  ACCOUNT_TEMPLATE_LIBRARY_ROUTE,
} from "../app/routes";
import { useAuth } from "../auth/useAuth";

function InfoCard({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`rounded border border-white/10 bg-black/20 p-4 ${wide ? "md:col-span-2" : ""}`}>
      <div className="text-xs tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 break-words text-sm font-medium text-slate-100">{value}</div>
    </div>
  );
}

function displayTenantName(name?: string | null) {
  if (!name) return "-";
  return name.replace(/'s Workspace$/i, " 的工作区");
}

function statusLabel(status?: string | null) {
  if (status === "active") return "正常";
  if (status === "disabled") return "已停用";
  if (status === "inactive") return "未启用";
  return status || "-";
}

export function AccountPage() {
  const { loading, logout, permissions, refreshMe, roles, tenant, user } = useAuth();
  const canManageProviderSettings = permissions.includes("admin:system");

  if (loading && !user) {
    return (
      <section className="flex min-h-[320px] items-center justify-center rounded border border-white/10 bg-white/[0.04]">
        <div className="inline-flex items-center gap-3 text-sm text-slate-300">
          <Loader2 className="animate-spin" size={16} />
          正在加载账号信息...
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="rounded border border-white/10 bg-[#0b0d14] p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded border border-sky-300/20 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-100">
              <UserRound size={14} />
              Account
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-white">账户管理</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              管理你的个人资料、工作区身份和模型连接入口。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15"
              onClick={() => void refreshMe()}
              type="button"
            >
              <RefreshCw size={15} />
              刷新
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded border border-red-400/20 bg-red-500/10 px-4 text-sm text-red-100 hover:bg-red-500/15"
              onClick={() => {
                void logout().finally(() => {
                  window.location.assign("/login");
                });
              }}
              type="button"
            >
              <LogOut size={15} />
              退出登录
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">当前身份</h2>
          <p className="mt-1 text-sm text-slate-500">用于登录、权限判断和团队协作的账号信息。</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <InfoCard label="邮箱" value={user?.email || "-"} />
            <InfoCard label="显示名称" value={user?.displayName || "-"} />
            <InfoCard label="用户 ID" value={user?.id || "-"} />
            <InfoCard label="状态" value={statusLabel(user?.status)} />
            <InfoCard label="角色" value={roles.join(", ") || "-"} wide />
            <InfoCard label="权限" value={permissions.join(", ") || "-"} wide />
          </div>
        </div>

        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">工作区信息</h2>
          <p className="mt-1 text-sm text-slate-500">当前项目、素材、计费和模型配置所属的租户空间。</p>
          <div className="mt-4 grid gap-3">
            <InfoCard label="工作区" value={displayTenantName(tenant?.name)} />
            <InfoCard label="工作区 ID" value={tenant?.id || "-"} />
            <InfoCard label="标识" value={tenant?.slug || "-"} />
            <InfoCard label="套餐" value={tenant?.plan || "-"} />
            <InfoCard label="状态" value={statusLabel(tenant?.status)} />
          </div>
        </div>
      </div>

      {canManageProviderSettings ? (
        <section className="rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-white">模型与连接</h2>
            <p className="text-sm text-slate-500">管理产品模型、供应商连接和初始化模板。</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <button
              className="flex min-h-24 flex-col items-start justify-between rounded border border-sky-300/25 bg-sky-500/10 p-4 text-left text-sky-100 hover:bg-sky-500/20"
              onClick={() => {
                window.location.assign(ACCOUNT_AI_SETTINGS_ROUTE);
              }}
              type="button"
            >
              <Sparkles size={18} />
              <span className="text-sm font-semibold">模型中心</span>
            </button>
            <button
              className="flex min-h-24 flex-col items-start justify-between rounded border border-white/10 bg-black/20 p-4 text-left text-slate-100 hover:bg-white/[0.06]"
              onClick={() => {
                window.location.assign(ACCOUNT_PROVIDER_SETTINGS_ROUTE);
              }}
              type="button"
            >
              <Settings2 size={18} />
              <span className="text-sm font-semibold">Provider Connections</span>
            </button>
            <button
              className="flex min-h-24 flex-col items-start justify-between rounded border border-white/10 bg-black/20 p-4 text-left text-slate-100 hover:bg-white/[0.06]"
              onClick={() => {
                window.location.assign(ACCOUNT_TEMPLATE_LIBRARY_ROUTE);
              }}
              type="button"
            >
              <Boxes size={18} />
              <span className="text-sm font-semibold">Template Library</span>
            </button>
            <button
              className="flex min-h-24 flex-col items-start justify-between rounded border border-white/10 bg-black/20 p-4 text-left text-slate-100 hover:bg-white/[0.06]"
              onClick={() => {
                window.location.assign(ACCOUNT_INSPECTION_ROUTE);
              }}
              type="button"
            >
              <Activity size={18} />
              <span className="text-sm font-semibold">巡检面板</span>
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
