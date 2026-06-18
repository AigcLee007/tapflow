import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Loader2, Network, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";

import { canAccessOperationsConsole, resolveProductRole } from "../auth/productRoles";
import { useAuth } from "../auth/useAuth";
import {
  createAdminRedeemCode,
  getAdminWorkflowRun,
  grantAdminCredits,
  listAdminWorkflowRuns,
  resetAdminPassword,
  searchAdminUsers,
  updateAdminMembershipTier,
  type AdminUser,
  type AdminWorkflowRun,
  type AdminWorkflowRunDetail,
  type MembershipTier,
} from "./adminApi";

const MEMBERSHIP_OPTIONS: Array<{ label: string; tier: MembershipTier }> = [
  { label: "普通用户", tier: "standard" },
  { label: "白银会员", tier: "silver" },
  { label: "黄金会员", tier: "gold" },
  { label: "至尊会员", tier: "platinum" },
];

const VALIDITY_OPTIONS = [
  { label: "1个月", mode: "months" as const, months: 1 },
  { label: "3个月", mode: "months" as const, months: 3 },
  { label: "1年", mode: "months" as const, months: 12 },
  { label: "长期", mode: "lifetime" as const },
];

const OPS_MODULES = [
  { description: "查看、搜索和定位所有创作者账号。", icon: Users, label: "用户管理", scope: "管理员" },
  { description: "调整普通、白银、黄金、至尊会员等级。", icon: ShieldCheck, label: "会员管理", scope: "管理员" },
  { description: "按 1 个月、3 个月、1 年或长期发放积分。", icon: CreditCard, label: "积分发放", scope: "管理员" },
  { description: "查看生成消耗、退款和异常记录。", icon: Search, label: "用量审计", scope: "管理员" },
  { description: "管理产品模型和线路，默认仅超级管理员。", icon: SlidersHorizontal, label: "模型线路管理", scope: "超级管理员" },
  { description: "管理供应商连接和密钥，默认仅超级管理员。", icon: Network, label: "供应商连接管理", scope: "超级管理员" },
  { description: "任命和移除管理员账号，仅超级管理员。", icon: ShieldCheck, label: "管理员账号管理", scope: "超级管理员" },
] as const;

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded border border-white/10 bg-black/30 p-3 text-xs text-slate-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AdminPage() {
  const { permissions, roles, tenant } = useAuth();
  const productRole = resolveProductRole({ permissions, roles });
  const isAdmin = canAccessOperationsConsole(productRole);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [grantReason, setGrantReason] = useState("staging 测试点数");
  const [grantCreditsValue, setGrantCreditsValue] = useState("1000");
  const [grantTenantId, setGrantTenantId] = useState("");
  const [grantValidity, setGrantValidity] = useState(VALIDITY_OPTIONS[1]);
  const [grantMessage, setGrantMessage] = useState<string | null>(null);
  const [membershipMessage, setMembershipMessage] = useState<string | null>(null);
  const [membershipTier, setMembershipTier] = useState<MembershipTier>("standard");
  const [redeemCreditsValue, setRedeemCreditsValue] = useState("1000");
  const [redeemMaxRedemptions, setRedeemMaxRedemptions] = useState("1");
  const [redeemTenantId, setRedeemTenantId] = useState("");
  const [redeemReason, setRedeemReason] = useState("管理员创建测试兑换码");
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [workflowRuns, setWorkflowRuns] = useState<AdminWorkflowRun[]>([]);
  const [workflowStatusFilter, setWorkflowStatusFilter] = useState("");
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunDetail, setSelectedRunDetail] = useState<AdminWorkflowRunDetail | null>(null);
  const [selectedRunLoading, setSelectedRunLoading] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const loadUsers = useCallback(async () => {
    if (!isAdmin) {
      setUsers([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await searchAdminUsers(query);
      setUsers(response.items);
      setSelectedUserId((current) => current ?? response.items[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "用户列表加载失败。");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, query]);

  const loadWorkflowRuns = useCallback(async () => {
    if (!isAdmin) {
      setWorkflowRuns([]);
      return;
    }
    setWorkflowLoading(true);
    setWorkflowError(null);
    try {
      const response = await listAdminWorkflowRuns({
        limit: 20,
        status: workflowStatusFilter || undefined,
      });
      setWorkflowRuns(response.items);
      setSelectedRunId((current) => current ?? response.items[0]?.id ?? null);
    } catch (loadError) {
      setWorkflowError(loadError instanceof Error ? loadError.message : "任务列表加载失败。");
    } finally {
      setWorkflowLoading(false);
    }
  }, [isAdmin, workflowStatusFilter]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadWorkflowRuns();
  }, [loadWorkflowRuns]);

  useEffect(() => {
    if (!selectedRunId || !isAdmin) {
      setSelectedRunDetail(null);
      return;
    }
    let cancelled = false;
    setSelectedRunLoading(true);
    void getAdminWorkflowRun(selectedRunId)
      .then((detail) => {
        if (!cancelled) {
          setSelectedRunDetail(detail);
        }
      })
      .catch((detailError) => {
        if (!cancelled) {
          setWorkflowError(detailError instanceof Error ? detailError.message : "任务详情加载失败。");
          setSelectedRunDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSelectedRunLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, selectedRunId]);

  useEffect(() => {
    if (selectedUser) {
      setGrantTenantId(selectedUser.memberships[0]?.tenantId ?? tenant?.id ?? "");
      setRedeemTenantId(selectedUser.memberships[0]?.tenantId ?? tenant?.id ?? "");
      setMembershipTier(selectedUser.memberships[0]?.membershipTier ?? "standard");
    }
  }, [selectedUser, tenant?.id]);

  if (!isAdmin) {
    return (
      <section className="rounded border border-amber-400/20 bg-amber-400/10 p-5 text-sm text-amber-100">
        当前管理后台仅对配置在 <code>ADMIN_EMAILS</code> 中的邮箱开放。
      </section>
    );
  }

  async function handleGrantCredits() {
    if (!selectedUser || !grantTenantId.trim()) return;
    setGrantMessage(null);
    try {
      const response = await grantAdminCredits({
        credits: Number.parseInt(grantCreditsValue, 10) || 0,
        reason: grantReason,
        targetUserId: selectedUser.id,
        tenantId: grantTenantId.trim(),
        validityMode: grantValidity.mode,
        validityMonths: "months" in grantValidity ? grantValidity.months : undefined,
      });
      setGrantMessage(
        `发放成功。当前可用 ${response.account.availableCredits} 点，已占用 ${response.account.reservedCredits} 点。`,
      );
      await loadUsers();
    } catch (grantError) {
      setGrantMessage(grantError instanceof Error ? grantError.message : "发放点数失败。");
    }
  }

  async function handleUpdateMembershipTier() {
    if (!selectedUser) return;
    setMembershipMessage(null);
    try {
      const response = await updateAdminMembershipTier({
        targetUserId: selectedUser.id,
        tenantId: grantTenantId.trim() || undefined,
        tier: membershipTier,
      });
      setMembershipMessage(`会员等级已更新：${response.membershipTier}`);
      await loadUsers();
    } catch (membershipError) {
      setMembershipMessage(membershipError instanceof Error ? membershipError.message : "会员等级更新失败。");
    }
  }

  async function handleCreateRedeemCode() {
    setRedeemMessage(null);
    try {
      const response = await createAdminRedeemCode({
        credits: Number.parseInt(redeemCreditsValue, 10) || 0,
        maxRedemptions: Number.parseInt(redeemMaxRedemptions, 10) || 1,
        reason: redeemReason,
        tenantId: redeemTenantId.trim() || undefined,
      });
      setRedeemMessage(`兑换码已创建，请及时复制：${response.code}`);
    } catch (redeemError) {
      setRedeemMessage(redeemError instanceof Error ? redeemError.message : "创建兑换码失败。");
    }
  }

  async function handleResetPassword() {
    if (!selectedUser) return;
    setPasswordMessage(null);
    try {
      const response = await resetAdminPassword({ userId: selectedUser.id });
      setPasswordMessage(`已为 ${response.user.email} 生成一次性临时密码：${response.passwordShownOnce}`);
    } catch (resetError) {
      setPasswordMessage(resetError instanceof Error ? resetError.message : "重置密码失败。");
    }
  }

  const topError = error ?? workflowError;
  const selectedRunError = selectedRunDetail?.workflowRun.errorJson;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-rose-300">管理后台</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">运营管理台</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            你可以在这里搜索用户、查看余额、发放测试点数、创建兑换码、重置密码，以及排查最近失败的工作流任务。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15"
            onClick={() => {
              void Promise.all([loadUsers(), loadWorkflowRuns()]);
            }}
            type="button"
          >
            <RefreshCw size={15} />
            刷新
          </button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {OPS_MODULES.map((module) => {
          const Icon = module.icon;
          return (
            <div className="rounded border border-white/10 bg-white/[0.04] p-4" key={module.label}>
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded border border-white/10 bg-white/[0.06] text-slate-200">
                  <Icon size={17} />
                </span>
                <div className="min-w-0">
                  <div className="font-medium text-white">{module.label}</div>
                  <div className="mt-1 text-xs text-cyan-200">{module.scope}</div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{module.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {topError ? (
        <div className="rounded border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {topError}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
        <section className="space-y-4 rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
              <input
                className="h-10 w-full rounded border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white outline-none ring-0 placeholder:text-slate-500"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索邮箱或显示名称"
                value={query}
              />
            </div>
            <button
              className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15"
              onClick={() => void loadUsers()}
              type="button"
            >
              {loading ? <Loader2 className="animate-spin" size={15} /> : <Search size={15} />}
              搜索
            </button>
          </div>

          <div className="space-y-2">
            {users.map((user) => {
              const active = user.id === selectedUserId;
              return (
                <button
                  className={`w-full rounded border px-4 py-3 text-left transition ${
                    active
                      ? "border-sky-300/30 bg-sky-400/10"
                      : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.05]"
                  }`}
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{user.displayName || user.email}</div>
                      <div className="text-xs text-slate-400">{user.email}</div>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <div>{user.status}</div>
                      <div>{user.memberships.length} 个工作区</div>
                    </div>
                  </div>
                </button>
              );
            })}
            {!loading && users.length === 0 ? (
              <div className="rounded border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                当前搜索条件下没有匹配用户。
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-semibold text-white">已选用户</h2>
            {selectedUser ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded border border-white/10 bg-black/20 p-4 text-sm text-slate-200">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">邮箱</div>
                    <div className="mt-2 break-all">{selectedUser.email}</div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/20 p-4 text-sm text-slate-200">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">状态</div>
                    <div className="mt-2">{selectedUser.status}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedUser.memberships.map((membership) => (
                    <div className="rounded border border-white/10 bg-black/20 p-4" key={membership.tenantId}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-white">{membership.tenantName}</div>
                          <div className="mt-1 text-xs text-slate-400">{membership.tenantId}</div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-right text-sm text-slate-200">
                          <div>
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">余额</div>
                            <div className="mt-1">{membership.balanceCredits} 点</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">已占用</div>
                            <div className="mt-1">{membership.reservedCredits} 点</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">可用</div>
                            <div className="mt-1">{membership.availableCredits} 点</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <h3 className="font-medium text-white">发放测试点数</h3>
                    <div className="mt-3 space-y-3">
                      <div className="rounded border border-white/10 bg-black/20 p-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Membership</div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {MEMBERSHIP_OPTIONS.map((option) => (
                            <button
                              className={`h-9 rounded border px-3 text-xs ${
                                membershipTier === option.tier
                                  ? "border-sky-300/40 bg-sky-500/15 text-sky-100"
                                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                              }`}
                              key={option.tier}
                              onClick={() => setMembershipTier(option.tier)}
                              type="button"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <button
                          className="mt-3 inline-flex h-9 items-center justify-center rounded border border-sky-300/25 bg-sky-500/10 px-3 text-xs text-sky-100 hover:bg-sky-500/20"
                          onClick={() => void handleUpdateMembershipTier()}
                          type="button"
                        >
                          保存会员等级
                        </button>
                        {membershipMessage ? <div className="mt-2 text-xs text-slate-300">{membershipMessage}</div> : null}
                      </div>
                      <input
                        className="h-10 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white"
                        onChange={(event) => setGrantTenantId(event.target.value)}
                        placeholder="工作区 ID"
                        value={grantTenantId}
                      />
                      <input
                        className="h-10 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white"
                        onChange={(event) => setGrantCreditsValue(event.target.value)}
                        placeholder="点数"
                        value={grantCreditsValue}
                      />
                      <input
                        className="h-10 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white"
                        onChange={(event) => setGrantReason(event.target.value)}
                        placeholder="原因"
                        value={grantReason}
                      />
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Credit validity</div>
                        <div className="grid grid-cols-4 gap-2">
                          {VALIDITY_OPTIONS.map((option) => (
                            <button
                              className={`h-9 rounded border px-2 text-xs ${
                                grantValidity.label === option.label
                                  ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-100"
                                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                              }`}
                              key={option.label}
                              onClick={() => setGrantValidity(option)}
                              type="button"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        className="inline-flex h-10 items-center justify-center rounded border border-emerald-300/25 bg-emerald-500/10 px-4 text-sm text-emerald-100 hover:bg-emerald-500/20"
                        onClick={() => void handleGrantCredits()}
                        type="button"
                      >
                        发放点数
                      </button>
                      {grantMessage ? <div className="text-sm text-slate-300">{grantMessage}</div> : null}
                    </div>
                  </div>

                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <h3 className="font-medium text-white">重置密码</h3>
                    <p className="mt-2 text-sm text-slate-400">
                      这会生成一个临时密码，并在需要时自动激活用户、标记邮箱已验证。请仅在确认身份后执行。
                    </p>
                    <button
                      className="mt-3 inline-flex h-10 items-center justify-center rounded border border-amber-300/25 bg-amber-500/10 px-4 text-sm text-amber-100 hover:bg-amber-500/20"
                      onClick={() => void handleResetPassword()}
                      type="button"
                    >
                      重置密码
                    </button>
                    {passwordMessage ? (
                      <div className="mt-3 rounded border border-white/10 bg-black/30 p-3 text-sm text-slate-200">
                        {passwordMessage}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-slate-400">请选择一位用户以查看余额并执行操作。</div>
            )}
          </div>

          <div className="rounded border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-semibold text-white">创建兑换码</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                className="h-10 rounded border border-white/10 bg-black/25 px-3 text-sm text-white"
                onChange={(event) => setRedeemTenantId(event.target.value)}
                placeholder="工作区 ID（可选）"
                value={redeemTenantId}
              />
              <input
                className="h-10 rounded border border-white/10 bg-black/25 px-3 text-sm text-white"
                onChange={(event) => setRedeemCreditsValue(event.target.value)}
                placeholder="点数"
                value={redeemCreditsValue}
              />
              <input
                className="h-10 rounded border border-white/10 bg-black/25 px-3 text-sm text-white"
                onChange={(event) => setRedeemMaxRedemptions(event.target.value)}
                placeholder="最大兑换次数"
                value={redeemMaxRedemptions}
              />
              <input
                className="h-10 rounded border border-white/10 bg-black/25 px-3 text-sm text-white md:col-span-2"
                onChange={(event) => setRedeemReason(event.target.value)}
                placeholder="原因"
                value={redeemReason}
              />
            </div>
            <button
              className="mt-3 inline-flex h-10 items-center justify-center rounded border border-sky-300/25 bg-sky-500/10 px-4 text-sm text-sky-100 hover:bg-sky-500/20"
              onClick={() => void handleCreateRedeemCode()}
              type="button"
            >
              创建兑换码
            </button>
            {redeemMessage ? (
              <div className="mt-3 rounded border border-white/10 bg-black/30 p-3 text-sm text-slate-200">
                {redeemMessage}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">最近失败任务</h2>
            <div className="flex gap-2">
              <input
                className="h-10 rounded border border-white/10 bg-black/25 px-3 text-sm text-white"
                onChange={(event) => setWorkflowStatusFilter(event.target.value)}
                placeholder="状态筛选"
                value={workflowStatusFilter}
              />
              <button
                className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15"
                onClick={() => void loadWorkflowRuns()}
                type="button"
              >
                {workflowLoading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
                刷新
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {workflowRuns.map((run) => {
              const active = run.id === selectedRunId;
              return (
                <button
                  className={`w-full rounded border px-4 py-3 text-left transition ${
                    active
                      ? "border-rose-300/30 bg-rose-400/10"
                      : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.05]"
                  }`}
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  type="button"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">{run.id}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {run.runMode} / {run.status} / target {run.targetNodeId || "-"}
                      </div>
                      {run.errorSummary ? (
                        <div className="mt-2 text-xs text-rose-200">{run.errorSummary}</div>
                      ) : null}
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <div>{formatDate(run.createdAt)}</div>
                      <div>{run.failedNodeRunCount} 个失败节点</div>
                    </div>
                  </div>
                </button>
              );
            })}
            {!workflowLoading && workflowRuns.length === 0 ? (
              <div className="rounded border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                当前筛选条件下没有任务记录。
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">任务详情</h2>
          {selectedRunLoading ? (
            <div className="mt-4 inline-flex items-center gap-3 text-sm text-slate-300">
              <Loader2 className="animate-spin" size={16} />
              正在加载任务详情...
            </div>
          ) : selectedRunDetail ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded border border-white/10 bg-black/20 p-4 text-sm text-slate-200">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">状态</div>
                  <div className="mt-2">{selectedRunDetail.workflowRun.status}</div>
                </div>
                <div className="rounded border border-white/10 bg-black/20 p-4 text-sm text-slate-200">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">目标节点</div>
                  <div className="mt-2 break-all">{selectedRunDetail.workflowRun.targetNodeId || "-"}</div>
                </div>
              </div>

              {selectedRunError ? (
                <div>
                  <div className="mb-2 text-sm font-medium text-white">工作流错误信息</div>
                  <JsonBlock value={selectedRunError} />
                </div>
              ) : null}

              <div className="space-y-3">
                {selectedRunDetail.nodeRuns.map((nodeRun) => (
                  <div className="rounded border border-white/10 bg-black/20 p-4" key={nodeRun.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">
                          {nodeRun.nodeType} / {nodeRun.nodeId}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {nodeRun.status} / 开始 {formatDate(nodeRun.startedAt)} / 结束 {formatDate(nodeRun.finishedAt)}
                        </div>
                      </div>
                    </div>
                    {nodeRun.errorJson ? (
                      <div className="mt-3">
                        <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">error_json</div>
                        <JsonBlock value={nodeRun.errorJson} />
                      </div>
                    ) : null}
                    {nodeRun.outputSummary ? (
                      <div className="mt-3">
                        <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">输出摘要</div>
                        <pre className="overflow-x-auto rounded border border-white/10 bg-black/30 p-3 text-xs text-slate-300">
                          {nodeRun.outputSummary}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm text-slate-400">请选择一条任务记录以查看失败详情。</div>
          )}
        </div>
      </section>
    </div>
  );
}
