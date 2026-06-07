import React from "react";
import { Boxes, Loader2, LogOut, RefreshCw, Settings2, Sparkles } from "lucide-react";

import {
  ACCOUNT_AI_SETTINGS_ROUTE,
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
  const canManageProviderSettings =
    permissions.includes("provider:read") ||
    permissions.includes("provider:manage") ||
    permissions.includes("credential:manage");

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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-sky-300">账号</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">账号中心</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            查看当前登录身份、所属工作区、角色权限，并进入模型中心管理模型与线路；进入连接页维护服务商、密钥和运行连接；模板库只用于初始化第一套配置。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageProviderSettings ? (
            <button
              className="inline-flex h-10 items-center gap-2 rounded border border-sky-300/25 bg-sky-500/10 px-4 text-sm text-sky-100 hover:bg-sky-500/20"
              onClick={() => {
                window.location.assign(ACCOUNT_AI_SETTINGS_ROUTE);
              }}
              type="button"
            >
              <Sparkles size={15} />
              模型中心
            </button>
          ) : null}
          {canManageProviderSettings ? (
            <button
              className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15"
              onClick={() => {
                window.location.assign(ACCOUNT_PROVIDER_SETTINGS_ROUTE);
              }}
              type="button"
            >
              <Settings2 size={15} />
              高级配置
            </button>
          ) : null}
          {canManageProviderSettings ? (
            <button
              className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/5 px-4 text-sm text-slate-300 hover:bg-white/10"
              onClick={() => {
                window.location.assign(ACCOUNT_TEMPLATE_LIBRARY_ROUTE);
              }}
              type="button"
            >
              <Boxes size={15} />
              初始化模板
            </button>
          ) : null}
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
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">当前身份</h2>
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
          <div className="mt-4 grid gap-3">
            <InfoCard label="工作区" value={displayTenantName(tenant?.name)} />
            <InfoCard label="工作区 ID" value={tenant?.id || "-"} />
            <InfoCard label="标识" value={tenant?.slug || "-"} />
            <InfoCard label="套餐" value={tenant?.plan || "-"} />
            <InfoCard label="状态" value={statusLabel(tenant?.status)} />
          </div>
        </div>
      </div>
    </section>
  );
}
