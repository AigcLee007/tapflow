import React from "react";
import {
  Activity,
  Boxes,
  CreditCard,
  Loader2,
  LogOut,
  RefreshCw,
  Settings2,
  Shield,
  Sparkles,
  UserRound,
} from "lucide-react";

import {
  ACCOUNT_AI_SETTINGS_ROUTE,
  ACCOUNT_INSPECTION_ROUTE,
  ACCOUNT_PROVIDER_SETTINGS_ROUTE,
  ACCOUNT_TEMPLATE_LIBRARY_ROUTE,
  ADMIN_ROUTE,
  BILLING_ROUTE,
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

function statusLabel(status?: string | null) {
  if (status === "active") return "正常";
  if (status === "disabled") return "已停用";
  if (status === "inactive") return "未启用";
  return status || "-";
}

function membershipLabel(plan?: string | null) {
  if (plan === "silver") return "白银会员";
  if (plan === "gold") return "黄金会员";
  if (plan === "platinum") return "至尊会员";
  return "普通用户";
}

function membershipDiscount(plan?: string | null) {
  if (plan === "silver") return "生成积分 9.5 折";
  if (plan === "gold") return "生成积分 9 折";
  if (plan === "platinum") return "生成积分 8 折";
  return "暂无生成折扣";
}

export function AccountPage() {
  const { loading, logout, permissions, refreshMe, tenant, user } = useAuth();
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
              管理你的个人资料、会员权益、积分额度和创作设置。
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">个人资料</h2>
          <p className="mt-1 text-sm text-slate-500">用于登录和接收账户通知的基础资料。</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <InfoCard label="邮箱" value={user?.email || "-"} />
            <InfoCard label="显示名称" value={user?.displayName || "-"} />
            <InfoCard label="状态" value={statusLabel(user?.status)} />
            <InfoCard label="当前套餐" value={tenant?.plan || "free"} />
          </div>
        </div>

        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">会员权益</h2>
          <p className="mt-1 text-sm text-slate-500">会员等级会影响生成任务的实际积分消耗。</p>
          <div className="mt-4 grid gap-3">
            <InfoCard label="会员等级" value={membershipLabel(tenant?.plan)} />
            <InfoCard label="生成权益" value={membershipDiscount(tenant?.plan)} />
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded border border-cyan-300/25 bg-cyan-500/10 px-4 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20"
              onClick={() => {
                window.location.assign(BILLING_ROUTE);
              }}
              type="button"
            >
              <CreditCard size={15} />
              查看积分与账单
            </button>
          </div>
        </div>
      </div>

      {canManageProviderSettings ? (
        <section className="rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-white">管理员工具</h2>
            <p className="text-sm text-slate-500">管理模型配置、供应商连接、初始化模板和运营后台。</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <button
              className="flex min-h-24 flex-col items-start justify-between rounded border border-rose-300/25 bg-rose-500/10 p-4 text-left text-rose-100 hover:bg-rose-500/20"
              onClick={() => {
                window.location.assign(ADMIN_ROUTE);
              }}
              type="button"
            >
              <Shield size={18} />
              <span className="text-sm font-semibold">运营后台</span>
            </button>
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
