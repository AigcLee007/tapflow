import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  Copy,
  CreditCard,
  ExternalLink,
  KeyRound,
  Loader2,
  Megaphone,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Pin,
  PinOff,
  Trash2,
  Users,
} from "lucide-react";

import {
  ACCOUNT_AI_SETTINGS_ROUTE,
  ACCOUNT_PROVIDER_SETTINGS_ROUTE,
} from "../app/routes";
import { canAccessOperationsConsole, resolveProductRole } from "../auth/productRoles";
import { useAuth } from "../auth/useAuth";
import {
  adjustAdminCredits,
  createAdminAnnouncement,
  createAdminRedeemCode,
  deleteAdminAnnouncement,
  deleteAdminRedeemCode,
  getAdminAiRouteStats,
  getAdminWorkflowRun,
  grantAdminCredits,
  listAdminAnnouncements,
  listAdminRedeemCodeRedemptions,
  listAdminRedeemCodes,
  listAdminWorkflowRuns,
  resetAdminPassword,
  searchAdminUsers,
  updateAdminAnnouncement,
  updateAdminMembershipTier,
  updateAdminUserRole,
  updateAdminUserStatus,
  type AdminAiRouteStats,
  type AdminAnnouncement,
  type AdminRedeemCode,
  type AdminRedeemCodeRedemption,
  type AdminUser,
  type AdminWorkflowRun,
  type AdminWorkflowRunDetail,
  type AnnouncementAudience,
  type AnnouncementStatus,
  type MembershipTier,
} from "./adminApi";

type OpsTab =
  | "overview"
  | "users"
  | "admins"
  | "credits"
  | "announcements"
  | "usage"
  | "models"
  | "providers"
  | "monitor";

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

const ROLE_OPTIONS = [
  { label: "创作者", roleKey: "flow_developer" as const },
  { label: "管理员", roleKey: "tenant_admin" as const },
  { label: "超级管理员", roleKey: "system_admin" as const },
];

const TABS: Array<{
  icon: React.ComponentType<{ size?: number }>;
  id: OpsTab;
  label: string;
  superOnly?: boolean;
}> = [
  { icon: Activity, id: "overview", label: "总览" },
  { icon: Users, id: "users", label: "用户管理" },
  { icon: ShieldCheck, id: "admins", label: "管理员账号", superOnly: true },
  { icon: CreditCard, id: "credits", label: "积分与兑换码" },
  { icon: Megaphone, id: "announcements", label: "通知公告" },
  { icon: Search, id: "usage", label: "用量审计" },
  { icon: SlidersHorizontal, id: "models", label: "模型线路", superOnly: true },
  { icon: Network, id: "providers", label: "供应商连接", superOnly: true },
  { icon: Activity, id: "monitor", label: "系统监控" },
];

const inputClass =
  "h-10 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/50";
const textareaClass =
  "min-h-[96px] w-full rounded border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/50";
const buttonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50";

function getTabFromHash(): OpsTab {
  if (typeof window === "undefined") return "overview";
  const hash = window.location.hash.replace("#", "") as OpsTab;
  return TABS.some((tab) => tab.id === hash) ? hash : "overview";
}

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatNumber(value?: number | null): string {
  return Number(value ?? 0).toLocaleString();
}

function membershipLabel(value?: MembershipTier | null): string {
  return MEMBERSHIP_OPTIONS.find((item) => item.tier === value)?.label ?? "普通用户";
}

function roleLabel(roleKey?: string | null): string {
  if (roleKey === "system_admin") return "超级管理员";
  if (roleKey === "tenant_admin") return "管理员";
  return "创作者";
}

function productRoleLabel(role: ReturnType<typeof resolveProductRole>): string {
  if (role === "super_admin") return "超级管理员";
  if (role === "admin") return "管理员";
  return "创作者";
}

function statusTone(status?: string | null) {
  if (status === "active" || status === "published" || status === "succeeded" || status === "settled" || status === "unredeemed") {
    return "border-emerald-300/20 bg-emerald-500/10 text-emerald-100";
  }
  if (status === "failed" || status === "archived" || status === "inactive" || status === "disabled" || status === "redeemed") {
    return "border-amber-300/20 bg-amber-500/10 text-amber-100";
  }
  return "border-white/10 bg-white/[0.06] text-slate-200";
}

function redeemStatusLabel(status?: string | null): string {
  return status === "redeemed" ? "已兑换" : "未兑换";
}

function userStatusLabel(status?: string | null): string {
  return status === "disabled" ? "已停用" : "正常";
}

function creditLedgerLabel(entryType?: string | null): string {
  if (entryType === "admin_credit") return "管理员增加";
  if (entryType === "admin_debit") return "管理员减少";
  if (entryType === "redeem") return "兑换码充值";
  if (entryType === "payment") return "账单充值";
  if (entryType === "refund") return "退款返还";
  if (entryType === "settle") return "生成消耗";
  return entryType || "积分变化";
}

function MetricCard({
  label,
  value,
  hint,
}: {
  hint?: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {hint ? <div className="mt-2 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

function SectionCard({
  children,
  title,
  action,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export function AdminPage() {
  const { permissions, roles, tenant } = useAuth();
  const productRole = resolveProductRole({ permissions, roles });
  const isAdmin = canAccessOperationsConsole(productRole);
  const isSuperAdmin = productRole === "super_admin";

  const [activeTab, setActiveTab] = useState<OpsTab>(() => getTabFromHash());
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [membershipTier, setMembershipTier] = useState<MembershipTier>("standard");
  const [roleKey, setRoleKey] = useState<"system_admin" | "tenant_admin" | "flow_developer">("flow_developer");
  const [grantCreditsValue, setGrantCreditsValue] = useState("1000");
  const [grantReason, setGrantReason] = useState("运营发放积分");
  const [grantValidity, setGrantValidity] = useState(VALIDITY_OPTIONS[1]);
  const [adjustCreditsValue, setAdjustCreditsValue] = useState("100");
  const [adjustReason, setAdjustReason] = useState("运营手动调整");

  const [redeemCodes, setRedeemCodes] = useState<AdminRedeemCode[]>([]);
  const [selectedRedeemCodeId, setSelectedRedeemCodeId] = useState<string | null>(null);
  const [redemptions, setRedemptions] = useState<AdminRedeemCodeRedemption[]>([]);
  const [redeemCreditsValue, setRedeemCreditsValue] = useState("1000");
  const [redeemMaxRedemptions, setRedeemMaxRedemptions] = useState("1");
  const [redeemReason, setRedeemReason] = useState("运营兑换码");
  const [lastGeneratedCode, setLastGeneratedCode] = useState("");

  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [announcementForm, setAnnouncementForm] = useState({
    audience: "all" as AnnouncementAudience,
    body: "",
    imageUrl: "",
    linkUrl: "",
    pinned: false,
    status: "draft" as AnnouncementStatus,
    title: "",
  });

  const [workflowRuns, setWorkflowRuns] = useState<AdminWorkflowRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunDetail, setSelectedRunDetail] = useState<AdminWorkflowRunDetail | null>(null);
  const [routeStats, setRouteStats] = useState<AdminAiRouteStats | null>(null);
  const [loadingOps, setLoadingOps] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );
  const selectedMembership = selectedUser?.memberships[0] ?? null;
  const selectedRedeemCode = useMemo(
    () => redeemCodes.find((code) => code.id === selectedRedeemCodeId) ?? null,
    [redeemCodes, selectedRedeemCodeId],
  );

  const totals = useMemo(() => {
    const memberships = users.flatMap((user) => user.memberships);
    return {
      admins: memberships.filter((membership) => membership.roleKey === "tenant_admin" || membership.roleKey === "system_admin").length,
      availableCredits: memberships.reduce((sum, item) => sum + item.availableCredits, 0),
      expiringUsers: memberships.filter((item) => item.nextCreditExpiresAt).length,
      users: users.length,
      usedCredits: memberships.reduce((sum, item) => sum + (item.usedCredits ?? 0), 0),
    };
  }, [users]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setUsersLoading(true);
    setError("");
    try {
      const response = await searchAdminUsers(query, 50);
      setUsers(response.items);
      setSelectedUserId((current) => current ?? response.items[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "用户列表加载失败");
    } finally {
      setUsersLoading(false);
    }
  }, [isAdmin, query]);

  const loadOperationalData = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingOps(true);
    setError("");
    try {
      const [codes, notices, stats, runs] = await Promise.all([
        listAdminRedeemCodes({ limit: 50 }),
        listAdminAnnouncements({ limit: 50 }),
        getAdminAiRouteStats({ windowMinutes: 30 }),
        listAdminWorkflowRuns({ limit: 30 }),
      ]);
      setRedeemCodes(codes.items);
      setSelectedRedeemCodeId((current) => current ?? codes.items[0]?.id ?? null);
      setAnnouncements(notices.items);
      setRouteStats(stats);
      setWorkflowRuns(runs.items);
      setSelectedRunId((current) => current ?? runs.items[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "运营数据加载失败");
    } finally {
      setLoadingOps(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadOperationalData();
  }, [loadOperationalData]);

  useEffect(() => {
    if (!selectedUser) return;
    const membership = selectedUser.memberships[0] ?? null;
    setMembershipTier(membership?.membershipTier ?? "standard");
    setRoleKey(
      membership?.roleKey === "system_admin" || membership?.roleKey === "tenant_admin"
        ? membership.roleKey
        : "flow_developer",
    );
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedRedeemCodeId) {
      setRedemptions([]);
      return;
    }
    let cancelled = false;
    void listAdminRedeemCodeRedemptions(selectedRedeemCodeId)
      .then((response) => {
        if (!cancelled) setRedemptions(response.items);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "兑换记录加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRedeemCodeId]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRunDetail(null);
      return;
    }
    let cancelled = false;
    void getAdminWorkflowRun(selectedRunId)
      .then((detail) => {
        if (!cancelled) setSelectedRunDetail(detail);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "用量详情加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.replaceState(null, "", `${window.location.pathname}#${activeTab}`);
  }, [activeTab]);

  useEffect(() => {
    const currentTab = TABS.find((tab) => tab.id === activeTab);
    if (currentTab?.superOnly && !isSuperAdmin) {
      setActiveTab("overview");
    }
  }, [activeTab, isSuperAdmin]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncTabFromLocation = () => setActiveTab(getTabFromHash());
    window.addEventListener("popstate", syncTabFromLocation);
    window.addEventListener("hashchange", syncTabFromLocation);
    return () => {
      window.removeEventListener("popstate", syncTabFromLocation);
      window.removeEventListener("hashchange", syncTabFromLocation);
    };
  }, []);

  if (!isAdmin) {
    return (
      <section className="rounded border border-amber-400/20 bg-amber-400/10 p-5 text-sm text-amber-100">
        当前账号没有运营后台权限。
      </section>
    );
  }

  async function refreshAll() {
    setMessage("");
    await Promise.all([loadUsers(), loadOperationalData()]);
  }

  async function handleMembershipSave() {
    if (!selectedUser || !selectedMembership) return;
    setMessage("");
    setError("");
    try {
      await updateAdminMembershipTier({
        targetUserId: selectedUser.id,
        tenantId: selectedMembership.tenantId,
        tier: membershipTier,
      });
      setMessage("会员等级已更新");
      await loadUsers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "会员等级更新失败");
    }
  }

  async function handleRoleSave() {
    if (!selectedUser || !selectedMembership) return;
    setMessage("");
    setError("");
    try {
      await updateAdminUserRole({
        roleKey,
        targetUserId: selectedUser.id,
        tenantId: selectedMembership.tenantId,
      });
      setMessage("用户身份已更新");
      await loadUsers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "用户身份更新失败");
    }
  }

  async function handleGrantCredits() {
    if (!selectedUser || !selectedMembership) return;
    setMessage("");
    setError("");
    try {
      await grantAdminCredits({
        credits: Number.parseInt(grantCreditsValue, 10) || 0,
        reason: grantReason,
        targetUserId: selectedUser.id,
        tenantId: selectedMembership.tenantId,
        validityMode: grantValidity.mode,
        validityMonths: "months" in grantValidity ? grantValidity.months : undefined,
      });
      setMessage("积分已发放");
      await Promise.all([loadUsers(), loadOperationalData()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "积分发放失败");
    }
  }

  async function handleAdjustCredits(direction: "add" | "subtract") {
    if (!selectedUser || !selectedMembership) return;
    setMessage("");
    setError("");
    try {
      await adjustAdminCredits({
        credits: Number.parseInt(adjustCreditsValue, 10) || 0,
        direction,
        reason: adjustReason,
        targetUserId: selectedUser.id,
        tenantId: selectedMembership.tenantId,
      });
      setMessage(direction === "add" ? "积分已增加" : "积分已减少");
      await Promise.all([loadUsers(), loadOperationalData()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "积分调整失败");
    }
  }

  async function handleUserStatus(status: "active" | "disabled") {
    if (!selectedUser) return;
    setMessage("");
    setError("");
    try {
      await updateAdminUserStatus({
        status,
        targetUserId: selectedUser.id,
      });
      setMessage(status === "disabled" ? "用户账号已停用" : "用户账号已启用");
      await loadUsers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "用户状态更新失败");
    }
  }

  async function handleCreateRedeemCode() {
    const tenantIdForCode = selectedMembership?.tenantId ?? tenant?.id;
    if (!tenantIdForCode) return;
    setMessage("");
    setError("");
    try {
      const response = await createAdminRedeemCode({
        credits: Number.parseInt(redeemCreditsValue, 10) || 0,
        maxRedemptions: Number.parseInt(redeemMaxRedemptions, 10) || 1,
        reason: redeemReason,
        tenantId: tenantIdForCode,
      });
      setLastGeneratedCode(response.code);
      setMessage("兑换码已生成");
      await loadOperationalData();
      setSelectedRedeemCodeId(response.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "兑换码创建失败");
    }
  }

  async function handleDeleteRedeemCode(code: AdminRedeemCode) {
    if (code.status === "redeemed") return;
    setMessage("");
    setError("");
    try {
      await deleteAdminRedeemCode(code.id);
      setMessage("未兑换的兑换码已删除");
      setSelectedRedeemCodeId((current) => (current === code.id ? null : current));
      await loadOperationalData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "兑换码删除失败");
    }
  }

  async function handleCreateAnnouncement() {
    if (!announcementForm.title.trim() || !announcementForm.body.trim()) return;
    setMessage("");
    setError("");
    try {
      await createAdminAnnouncement({
        audience: announcementForm.audience,
        body: announcementForm.body,
        imageUrl: announcementForm.imageUrl.trim() || null,
        linkUrl: announcementForm.linkUrl.trim() || null,
        pinned: announcementForm.pinned,
        status: announcementForm.status,
        title: announcementForm.title,
      });
      setAnnouncementForm({
        audience: "all",
        body: "",
        imageUrl: "",
        linkUrl: "",
        pinned: false,
        status: "draft",
        title: "",
      });
      setMessage("通知公告已保存");
      await loadOperationalData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "通知公告保存失败");
    }
  }

  async function handleArchiveAnnouncement(announcement: AdminAnnouncement) {
    setMessage("");
    setError("");
    try {
      await updateAdminAnnouncement(announcement.id, { status: "archived" });
      setMessage("通知公告已归档");
      await loadOperationalData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "通知公告更新失败");
    }
  }

  async function handleAnnouncementStatus(announcement: AdminAnnouncement, status: AnnouncementStatus) {
    setMessage("");
    setError("");
    try {
      await updateAdminAnnouncement(announcement.id, { status });
      setMessage(status === "published" ? "通知公告已发布" : "通知公告已更新");
      await loadOperationalData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "通知公告更新失败");
    }
  }

  async function handleToggleAnnouncementPinned(announcement: AdminAnnouncement) {
    setMessage("");
    setError("");
    try {
      await updateAdminAnnouncement(announcement.id, { pinned: !announcement.pinned });
      setMessage(announcement.pinned ? "通知公告已取消置顶" : "通知公告已置顶");
      await loadOperationalData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "通知公告更新失败");
    }
  }

  async function handleDeleteAnnouncement(announcement: AdminAnnouncement) {
    setMessage("");
    setError("");
    try {
      await deleteAdminAnnouncement(announcement.id);
      setMessage("通知公告已删除");
      await loadOperationalData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "通知公告删除失败");
    }
  }

  async function copyText(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard?.writeText(value);
      setMessage(`${label}已复制`);
      setError("");
    } catch {
      setError("复制失败，请手动复制");
    }
  }

  async function handleResetPassword() {
    if (!selectedUser) return;
    setMessage("");
    setError("");
    try {
      const response = await resetAdminPassword({ userId: selectedUser.id });
      setMessage(`临时密码：${response.passwordShownOnce}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "重置密码失败");
    }
  }

  const visibleTabs = TABS.filter((tab) => !tab.superOnly || isSuperAdmin);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">运营后台</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">运营管理台</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            当前身份、用户积分、兑换码、公告、用量审计和模型线路健康都集中在这里。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={buttonClass} onClick={() => void refreshAll()} type="button">
            {loadingOps || usersLoading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
            刷新
          </button>
        </div>
      </header>

      <section className="grid gap-3 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
        <div className="rounded border border-white/10 bg-white/[0.04] p-4">
          <div className="text-sm font-medium text-white">当前身份</div>
          <div className="mt-3 text-2xl font-semibold text-white">{productRoleLabel(productRole)}</div>
          <div className="mt-2 text-sm leading-6 text-slate-400">
            {productRole === "super_admin"
              ? roles.includes("system_admin")
                ? "来源：system_admin 角色。拥有所有运营和系统配置权限。"
                : "来源：ADMIN_EMAILS 启动超级管理员。建议上线后再分配正式管理员账号。"
              : "来源：admin:system 权限。可查看用户、积分、公告和审计。"}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="用户数" value={totals.users} />
          <MetricCard label="管理员数" value={totals.admins} />
          <MetricCard label="可用积分" value={formatNumber(totals.availableCredits)} />
          <MetricCard label="线路成功率" value={`${routeStats?.summary.successRate ?? 0}%`} hint="最近30分钟" />
        </div>
      </section>

      {error ? <div className="rounded border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}

      <nav className="flex gap-2 overflow-x-auto rounded border border-white/10 bg-white/[0.03] p-2">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded px-3 text-sm transition ${
                active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/[0.08] hover:text-white"
              }`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === "overview" ? renderOverview() : null}
      {activeTab === "users" ? renderUsers() : null}
      {activeTab === "admins" ? renderAdmins() : null}
      {activeTab === "credits" ? renderCredits() : null}
      {activeTab === "announcements" ? renderAnnouncements() : null}
      {activeTab === "usage" ? renderUsage() : null}
      {activeTab === "models" ? renderModelRoutes() : null}
      {activeTab === "providers" ? renderProviders() : null}
      {activeTab === "monitor" ? renderMonitor() : null}
    </div>
  );

  function renderOverview() {
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <SectionCard title="运营概览">
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard label="已使用积分" value={formatNumber(totals.usedCredits)} />
            <MetricCard label="有积分到期的用户" value={totals.expiringUsers} />
            <MetricCard label="兑换码" value={redeemCodes.length} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {routeStats?.routes.slice(0, 4).map((route) => (
              <div className="rounded border border-white/10 bg-black/20 p-4" key={route.routeId ?? route.routeKey ?? "unknown"}>
                <div className="font-medium text-white">{route.modelDisplayName || "模型"} {route.routeLabel || "线路"}</div>
                <div className="mt-2 text-sm text-slate-400">
                  成功率 {route.successRate}% · {route.successfulCalls}/{route.totalCalls} · 平均 {route.averageLatencyMs ?? "-"} ms
                </div>
              </div>
            ))}
            {!routeStats?.routes.length ? (
              <div className="rounded border border-dashed border-white/10 p-5 text-sm text-slate-400">
                最近30分钟还没有模型线路调用记录。
              </div>
            ) : null}
          </div>
        </SectionCard>
        <SectionCard title="最近公告">
          <div className="space-y-2">
            {announcements.slice(0, 5).map((announcement) => (
              <div className="rounded border border-white/10 bg-black/20 px-4 py-3" key={announcement.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-white">{announcement.title}</div>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(announcement.status)}`}>
                    {announcement.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-400">{formatDate(announcement.updatedAt)}</div>
              </div>
            ))}
            {!announcements.length ? <div className="text-sm text-slate-400">还没有通知公告。</div> : null}
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderUsers() {
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.05fr)]">
        <SectionCard
          title="用户管理"
          action={
            <div className="flex gap-2">
              <div className="relative min-w-[240px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                <input
                  className={`${inputClass} pl-9`}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索邮箱或名称"
                  value={query}
                />
              </div>
              <button className={buttonClass} onClick={() => void loadUsers()} type="button">
                {usersLoading ? <Loader2 className="animate-spin" size={15} /> : <Search size={15} />}
                搜索
              </button>
            </div>
          }
        >
          <div className="space-y-2">
            {users.map((user) => {
              const membership = user.memberships[0];
              const active = user.id === selectedUserId;
              return (
                <button
                  className={`w-full rounded border px-4 py-3 text-left transition ${
                    active ? "border-sky-300/40 bg-sky-500/10" : "border-white/10 bg-black/20 hover:bg-white/[0.05]"
                  }`}
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">{user.displayName || user.email}</div>
                      <div className="truncate text-xs text-slate-400">{user.email}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>最近登录 {formatDate(user.lastLoginAt)}</span>
                        <span className={`rounded-full border px-2 py-0.5 ${statusTone(user.status)}`}>{userStatusLabel(user.status)}</span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-300">
                      <div>{roleLabel(membership?.roleKey)}</div>
                      <div className="mt-1">{formatNumber(membership?.availableCredits)} 点</div>
                    </div>
                  </div>
                </button>
              );
            })}
            {!usersLoading && users.length === 0 ? <div className="text-sm text-slate-400">没有匹配用户。</div> : null}
          </div>
        </SectionCard>
        {renderSelectedUserPanel()}
      </div>
    );
  }

  function renderSelectedUserPanel() {
    if (!selectedUser || !selectedMembership) {
      return (
        <SectionCard title="用户详情">
          <div className="text-sm text-slate-400">请选择一个用户。</div>
        </SectionCard>
      );
    }
    return (
      <SectionCard title="用户详情">
        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard label="积分总额" value={formatNumber(selectedMembership.balanceCredits)} />
          <MetricCard label="已使用" value={formatNumber(selectedMembership.usedCredits)} />
          <MetricCard label="最近到期" value={formatDate(selectedMembership.nextCreditExpiresAt)} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-medium text-white">{selectedUser.displayName || selectedUser.email}</div>
            <div className="mt-2 text-sm text-slate-400">{selectedUser.email}</div>
            <div className="mt-3 grid gap-2 text-sm text-slate-300">
              <div>账号状态：{userStatusLabel(selectedUser.status)}</div>
              <div>身份：{roleLabel(selectedMembership.roleKey)}</div>
              <div>会员：{membershipLabel(selectedMembership.membershipTier)}</div>
              <div>最近登录：{formatDate(selectedUser.lastLoginAt)}</div>
              <div>用量：{selectedMembership.usageAudit?.settledEvents ?? 0} 次 / {formatNumber(selectedMembership.usageAudit?.settledCredits)} 点</div>
            </div>
          </div>
          <div className="rounded border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-medium text-white">会员等级</div>
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
            <button className={`${buttonClass} mt-3`} onClick={() => void handleMembershipSave()} type="button">
              保存会员等级
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-medium text-white">发放积分</div>
            <div className="mt-3 grid gap-3">
              <input className={inputClass} onChange={(event) => setGrantCreditsValue(event.target.value)} value={grantCreditsValue} />
              <input className={inputClass} onChange={(event) => setGrantReason(event.target.value)} value={grantReason} />
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
              <button className={buttonClass} onClick={() => void handleGrantCredits()} type="button">
                发放积分
              </button>
              {isSuperAdmin ? (
                <div className="mt-2 rounded border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-xs font-medium text-slate-300">手动调整积分</div>
                  <div className="mt-3 grid gap-2">
                    <input className={inputClass} onChange={(event) => setAdjustCreditsValue(event.target.value)} value={adjustCreditsValue} />
                    <input className={inputClass} onChange={(event) => setAdjustReason(event.target.value)} value={adjustReason} />
                    <div className="grid grid-cols-2 gap-2">
                      <button className={buttonClass} onClick={() => void handleAdjustCredits("add")} type="button">
                        增加积分
                      </button>
                      <button className={`${buttonClass} border-amber-300/20 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20`} onClick={() => void handleAdjustCredits("subtract")} type="button">
                        减少积分
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-medium text-white">账户操作</div>
            <button className={`${buttonClass} mt-3`} onClick={() => void handleResetPassword()} type="button">
              <KeyRound size={15} />
              重置临时密码
            </button>
            {isSuperAdmin ? (
              <button
                className={`${buttonClass} mt-3 ${selectedUser.status === "disabled" ? "" : "border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/20"}`}
                onClick={() => void handleUserStatus(selectedUser.status === "disabled" ? "active" : "disabled")}
                type="button"
              >
                {selectedUser.status === "disabled" ? "启用用户账号" : "停用用户账号"}
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 rounded border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-white">积分变化明细</div>
            <div className="text-xs text-slate-500">最近 10 条</div>
          </div>
          <div className="mt-3 space-y-2">
            {(selectedMembership.creditLedger ?? []).map((entry) => (
              <div className="grid gap-2 rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-sm md:grid-cols-[150px_minmax(0,1fr)_96px]" key={entry.id}>
                <div className="text-slate-400">{formatDate(entry.createdAt)}</div>
                <div className="min-w-0">
                  <div className="font-medium text-white">{creditLedgerLabel(entry.entryType)}</div>
                  <div className="truncate text-xs text-slate-500">{entry.description || "-"}</div>
                </div>
                <div className={`text-right font-semibold ${entry.direction === "debit" ? "text-amber-200" : "text-emerald-200"}`}>
                  {entry.direction === "debit" ? "-" : "+"}{formatNumber(entry.amountCredits)}
                </div>
              </div>
            ))}
            {!(selectedMembership.creditLedger ?? []).length ? (
              <div className="rounded border border-dashed border-white/10 p-4 text-sm text-slate-400">暂无积分变化记录。</div>
            ) : null}
          </div>
        </div>
      </SectionCard>
    );
  }

  function renderAdmins() {
    const adminUsers = users.filter((user) => {
      const role = user.memberships[0]?.roleKey;
      return role === "tenant_admin" || role === "system_admin";
    });
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SectionCard title="管理员账号">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">用户</th>
                  <th className="px-3 py-2">当前身份</th>
                  <th className="px-3 py-2">会员</th>
                  <th className="px-3 py-2">最近登录</th>
                  <th className="px-3 py-2">积分</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((user) => {
                  const membership = user.memberships[0];
                  return (
                    <tr
                      className="cursor-pointer border-t border-white/8 hover:bg-white/[0.03]"
                      key={user.id}
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <td className="px-3 py-3 text-white">{user.email}</td>
                      <td className="px-3 py-3 text-slate-300">{roleLabel(membership?.roleKey)}</td>
                      <td className="px-3 py-3 text-slate-300">{membershipLabel(membership?.membershipTier)}</td>
                      <td className="px-3 py-3 text-slate-300">{formatDate(user.lastLoginAt)}</td>
                      <td className="px-3 py-3 text-slate-300">{formatNumber(membership?.availableCredits)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!adminUsers.length ? <div className="px-3 py-6 text-sm text-slate-400">暂无管理员账号。</div> : null}
          </div>
        </SectionCard>
        <SectionCard title="身份调整">
          {selectedUser && selectedMembership ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-300">{selectedUser.email}</div>
              <div className="grid gap-2">
                {ROLE_OPTIONS.map((option) => (
                  <button
                    className={`h-10 rounded border px-3 text-left text-sm ${
                      roleKey === option.roleKey
                        ? "border-sky-300/40 bg-sky-500/15 text-sky-100"
                        : "border-white/10 bg-black/20 text-slate-300"
                    }`}
                    key={option.roleKey}
                    onClick={() => setRoleKey(option.roleKey)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button className={buttonClass} onClick={() => void handleRoleSave()} type="button">
                保存身份
              </button>
              <div className="text-xs leading-5 text-slate-500">
                超级管理员可以提升用户为管理员；管理员可以看用户和运营数据，但不能管理系统级线路和供应商连接。
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">请选择用户。</div>
          )}
        </SectionCard>
      </div>
    );
  }

  function renderCredits() {
    return (
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <SectionCard title="创建兑换码">
          <div className="grid gap-3">
            <Field label="点数">
              <input className={inputClass} onChange={(event) => setRedeemCreditsValue(event.target.value)} value={redeemCreditsValue} />
            </Field>
            <Field label="可使用次数">
              <input className={inputClass} onChange={(event) => setRedeemMaxRedemptions(event.target.value)} value={redeemMaxRedemptions} />
            </Field>
            <Field label="备注">
              <input className={inputClass} onChange={(event) => setRedeemReason(event.target.value)} value={redeemReason} />
            </Field>
            <button className={buttonClass} onClick={() => void handleCreateRedeemCode()} type="button">
              创建兑换码
            </button>
            {lastGeneratedCode ? (
              <div className="rounded border border-emerald-300/20 bg-emerald-500/10 p-3">
                <div className="text-xs text-emerald-200">已生成兑换码</div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="font-mono text-lg font-semibold text-white">{lastGeneratedCode}</div>
                  <button
                    aria-label="复制新兑换码"
                    className="grid h-9 w-9 place-items-center rounded border border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20"
                    onClick={() => void copyText(lastGeneratedCode, "兑换码")}
                    type="button"
                  >
                    <Copy size={15} />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>
        <SectionCard title="兑换码记录">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-2">
              {redeemCodes.map((code) => (
                <div
                  className={`w-full rounded border px-4 py-3 text-left ${
                    code.id === selectedRedeemCodeId ? "border-sky-300/40 bg-sky-500/10" : "border-white/10 bg-black/20"
                  }`}
                  key={code.id}
                  onClick={() => setSelectedRedeemCodeId(code.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button className="min-w-0 flex-1 text-left" type="button">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-white">{code.code ?? "历史兑换码未保存明文"}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(code.status)}`}>
                          {redeemStatusLabel(code.status)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-slate-300">{formatNumber(code.credits)} 点</div>
                      <div className="mt-1 text-xs text-slate-400">{code.reason || "无备注"} · 创建人 {code.createdByEmail || "-"}</div>
                    </button>
                    <div className="flex shrink-0 items-start gap-3 text-right text-xs text-slate-300">
                      <div>
                      <div>{code.redeemedCount}/{code.maxRedemptions}</div>
                      <div>{formatDate(code.createdAt)}</div>
                      </div>
                      <button
                        aria-label={code.code ? `复制兑换码 ${code.code}` : "历史兑换码未保存明文"}
                        className={`grid h-8 w-8 place-items-center rounded border border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/[0.12] ${
                          code.code ? "" : "cursor-not-allowed opacity-40"
                        }`}
                        disabled={!code.code}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (code.code) {
                            void copyText(code.code, "兑换码");
                          }
                        }}
                        type="button"
                      >
                        <Copy size={14} />
                      </button>
                      {code.status !== "redeemed" ? (
                        <button
                          aria-label="删除未兑换兑换码"
                          className="grid h-8 w-8 place-items-center rounded border border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/20"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteRedeemCode(code);
                          }}
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-medium text-white">使用记录</div>
              {selectedRedeemCode ? (
                <div className="mt-3 text-xs text-slate-400">
                  {selectedRedeemCode.tenantName || "当前租户"} · {redeemStatusLabel(selectedRedeemCode.status)}
                </div>
              ) : null}
              <div className="mt-3 space-y-2">
                {redemptions.map((item) => (
                  <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2" key={item.id}>
                    <div className="text-sm text-white">{item.userDisplayName || item.userEmail || "-"}</div>
                    <div className="mt-1 text-xs text-slate-400">{formatDate(item.createdAt)}</div>
                  </div>
                ))}
                {selectedRedeemCode && redemptions.length === 0 ? <div className="text-sm text-slate-400">还没有用户使用。</div> : null}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderAnnouncements() {
    return (
      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <SectionCard title="发布通知公告">
          <div className="grid gap-3">
            <Field label="标题">
              <input className={inputClass} onChange={(event) => setAnnouncementForm((current) => ({ ...current, title: event.target.value }))} value={announcementForm.title} />
            </Field>
            <Field label="正文">
              <textarea className={textareaClass} onChange={(event) => setAnnouncementForm((current) => ({ ...current, body: event.target.value }))} value={announcementForm.body} />
            </Field>
            <Field label="链接">
              <input className={inputClass} onChange={(event) => setAnnouncementForm((current) => ({ ...current, linkUrl: event.target.value }))} value={announcementForm.linkUrl} />
            </Field>
            <Field label="图片 URL">
              <input className={inputClass} onChange={(event) => setAnnouncementForm((current) => ({ ...current, imageUrl: event.target.value }))} value={announcementForm.imageUrl} />
            </Field>
            <button
              className={`h-10 rounded border px-3 text-left text-sm ${
                announcementForm.pinned
                  ? "border-cyan-300/40 bg-cyan-500/15 text-cyan-100"
                  : "border-white/10 bg-white/[0.04] text-slate-300"
              }`}
              onClick={() => setAnnouncementForm((current) => ({ ...current, pinned: !current.pinned }))}
              type="button"
            >
              {announcementForm.pinned ? "已置顶：首页铃铛优先展示" : "不置顶"}
            </button>
            <div className="grid grid-cols-2 gap-3">
              <Field label="状态">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "草稿", value: "draft" as AnnouncementStatus },
                    { label: "发布", value: "published" as AnnouncementStatus },
                    { label: "归档", value: "archived" as AnnouncementStatus },
                  ].map((option) => (
                    <button
                      className={`h-9 rounded border px-2 text-xs ${
                        announcementForm.status === option.value
                          ? "border-sky-300/40 bg-sky-500/15 text-sky-100"
                          : "border-white/10 bg-white/[0.04] text-slate-300"
                      }`}
                      key={option.value}
                      onClick={() => setAnnouncementForm((current) => ({ ...current, status: option.value }))}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="对象">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "全部", value: "all" as AnnouncementAudience },
                    { label: "创作者", value: "creator" as AnnouncementAudience },
                    { label: "管理员", value: "admin" as AnnouncementAudience },
                  ].map((option) => (
                    <button
                      className={`h-9 rounded border px-2 text-xs ${
                        announcementForm.audience === option.value
                          ? "border-sky-300/40 bg-sky-500/15 text-sky-100"
                          : "border-white/10 bg-white/[0.04] text-slate-300"
                      }`}
                      key={option.value}
                      onClick={() => setAnnouncementForm((current) => ({ ...current, audience: option.value }))}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <button className={buttonClass} onClick={() => void handleCreateAnnouncement()} type="button">
              <Bell size={15} />
              保存公告
            </button>
          </div>
        </SectionCard>
        <SectionCard title="公告管理">
          <div className="space-y-2">
            {announcements.map((announcement) => (
              <div className="rounded border border-white/10 bg-black/20 p-4" key={announcement.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-white">{announcement.title}</div>
                      {announcement.pinned ? (
                        <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-100">
                          置顶
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-slate-400">{announcement.body}</div>
                    <div className="mt-2 text-xs text-slate-500">创建人 {announcement.createdByEmail || "-"} · {formatDate(announcement.createdAt)}</div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(announcement.status)}`}>{announcement.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {announcement.linkUrl ? <a className={buttonClass} href={announcement.linkUrl} rel="noreferrer" target="_blank"><ExternalLink size={14} />打开链接</a> : null}
                  <button className={buttonClass} onClick={() => void handleToggleAnnouncementPinned(announcement)} type="button">
                    {announcement.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    {announcement.pinned ? "取消置顶" : "置顶"}
                  </button>
                  {announcement.status !== "published" ? (
                    <button className={buttonClass} onClick={() => void handleAnnouncementStatus(announcement, "published")} type="button">
                      发布
                    </button>
                  ) : null}
                  {announcement.status !== "archived" ? (
                    <button className={buttonClass} onClick={() => void handleArchiveAnnouncement(announcement)} type="button">
                      归档
                    </button>
                  ) : null}
                  <button className={`${buttonClass} border-red-300/20 bg-red-500/10 text-red-100 hover:bg-red-500/20`} onClick={() => void handleDeleteAnnouncement(announcement)} type="button">
                    <Trash2 size={14} />
                    删除
                  </button>
                </div>
              </div>
            ))}
            {!announcements.length ? <div className="text-sm text-slate-400">还没有公告。</div> : null}
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderUsage() {
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
        <SectionCard title="用量审计">
          <div className="space-y-2">
            {workflowRuns.map((run) => (
              <button
                className={`w-full rounded border px-4 py-3 text-left ${run.id === selectedRunId ? "border-sky-300/40 bg-sky-500/10" : "border-white/10 bg-black/20"}`}
                key={run.id}
                onClick={() => setSelectedRunId(run.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-white">{run.runMode}</div>
                    <div className="mt-1 text-xs text-slate-400">{run.status} · {run.errorSummary || "无错误摘要"}</div>
                  </div>
                  <div className="text-right text-xs text-slate-400">{formatDate(run.createdAt)}</div>
                </div>
              </button>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="审计详情">
          {selectedRunDetail ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <MetricCard label="状态" value={selectedRunDetail.workflowRun.status} />
                <MetricCard label="节点数" value={selectedRunDetail.workflowRun.nodeRunCount} />
                <MetricCard label="失败节点" value={selectedRunDetail.workflowRun.failedNodeRunCount} />
              </div>
              {selectedRunDetail.nodeRuns.map((node) => (
                <div className="rounded border border-white/10 bg-black/20 p-4" key={node.id}>
                  <div className="font-medium text-white">{node.nodeType}</div>
                  <div className="mt-1 text-sm text-slate-400">{node.status} · {formatDate(node.startedAt)} - {formatDate(node.finishedAt)}</div>
                  {node.errorJson ? <pre className="mt-3 max-h-48 overflow-auto rounded bg-black/30 p-3 text-xs text-slate-300">{JSON.stringify(node.errorJson, null, 2)}</pre> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-400">请选择一条记录。</div>
          )}
        </SectionCard>
      </div>
    );
  }

  function renderModelRoutes() {
    return (
      <SectionCard title="模型线路管理">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-medium text-white">模型中心</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              管理产品模型、用户看到的线路名称、默认线路、价格、状态和线路测试。
            </p>
            <button className={`${buttonClass} mt-4`} onClick={() => navigate(ACCOUNT_AI_SETTINGS_ROUTE)} type="button">
              <SlidersHorizontal size={15} />
              打开模型中心
            </button>
          </div>
          <div className="rounded border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-medium text-white">当前线路状态</div>
            <div className="mt-3 space-y-2">
              {routeStats?.routes.slice(0, 5).map((route) => (
                <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2" key={route.routeId ?? route.routeKey ?? "route"}>
                  <div className="text-sm text-white">{route.modelDisplayName || "模型"} {route.routeLabel || "线路"}</div>
                  <div className="text-xs text-slate-400">成功率 {route.successRate}% · 平均 {route.averageLatencyMs ?? "-"} ms</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>
    );
  }

  function renderProviders() {
    return (
      <SectionCard title="供应商连接管理">
        <div className="rounded border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-medium text-white">供应商连接</div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            管理供应商资源、API Key、Base URL、运行连接、连接测试和被哪些线路复用。
          </p>
          <button className={`${buttonClass} mt-4`} onClick={() => navigate(ACCOUNT_PROVIDER_SETTINGS_ROUTE)} type="button">
            <Network size={15} />
            打开供应商连接
          </button>
        </div>
      </SectionCard>
    );
  }

  function renderMonitor() {
    return (
      <SectionCard title="系统监控">
        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="总调用" value={routeStats?.summary.totalCalls ?? 0} />
          <MetricCard label="成功率" value={`${routeStats?.summary.successRate ?? 0}%`} />
          <MetricCard label="平均耗时" value={`${routeStats?.summary.averageLatencyMs ?? "-"} ms`} />
          <MetricCard label="失败" value={routeStats?.summary.failedCalls ?? 0} />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">线路</th>
                <th className="px-3 py-2">模型</th>
                <th className="px-3 py-2">成功率</th>
                <th className="px-3 py-2">成功/总数</th>
                <th className="px-3 py-2">平均耗时</th>
                <th className="px-3 py-2">最近失败</th>
              </tr>
            </thead>
            <tbody>
              {routeStats?.routes.map((route) => (
                <tr className="border-t border-white/8" key={route.routeId ?? route.routeKey ?? "unknown"}>
                  <td className="px-3 py-3 text-white">{route.routeLabel || "-"}</td>
                  <td className="px-3 py-3 text-slate-300">{route.modelDisplayName || "-"}</td>
                  <td className="px-3 py-3 text-slate-300">{route.successRate}%</td>
                  <td className="px-3 py-3 text-slate-300">{route.successfulCalls}/{route.totalCalls}</td>
                  <td className="px-3 py-3 text-slate-300">{route.averageLatencyMs ?? "-"} ms</td>
                  <td className="px-3 py-3 text-slate-300">{formatDate(route.lastFailureAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    );
  }
}
