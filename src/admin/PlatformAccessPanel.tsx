import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { hasPlatformCapability } from "../auth/productRoles";
import { MenuSelect } from "../components/menu/MenuSelect";
import { changePlatformRole, listPlatformRoleAssignments, type PlatformRoleAssignment, type PlatformRoleKey } from "../services/v2PlatformAccessApi";
import type { AdminUser } from "./adminApi";

const roleOptions = [
  { label: "平台运营管理员", value: "platform_operator" },
  { label: "平台超级管理员", value: "platform_super_admin" },
  { label: "撤销平台授权", value: "none" },
];
const fieldClass = "mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white";

export function PlatformAccessPanel({ users, query, onQueryChange, selectedUserId, onSelectUser }: {
  users: Array<Pick<AdminUser, "id" | "email" | "displayName">>;
  query: string; onQueryChange: (value: string) => void;
  selectedUserId: string | null; onSelectUser: (value: string) => void;
}) {
  const auth = useAuth();
  const canManage = hasPlatformCapability(auth, "platform:roles:manage");
  const [assignments, setAssignments] = useState<PlatformRoleAssignment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [role, setRole] = useState<PlatformRoleKey | "none">("platform_operator");
  const [reason, setReason] = useState("");
  const current = assignments.find((item) => item.userId === selectedUserId);
  const isSelf = selectedUserId === auth.user?.id;
  const load = useCallback(async () => {
    if (!canManage) return;
    setLoaded(false);
    try { setAssignments((await listPlatformRoleAssignments()).items); setLoaded(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "平台授权加载失败。"); }
  }, [canManage]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setRole(current?.revokedAt ? "none" : current?.roleKey ?? "platform_operator");
  }, [selectedUserId, current?.roleKey, current?.revokedAt]);
  useEffect(() => { setReason(""); setError(""); setMessage(""); }, [selectedUserId]);

  async function save() {
    if (!canManage || !loaded || busy || isSelf || !selectedUserId || reason.trim().length < 5) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { assignment } = await changePlatformRole(selectedUserId, { roleKey: role === "none" ? null : role, expectedVersion: current?.version ?? 0, reason: reason.trim() });
      setAssignments((items) => [...items.filter((item) => item.userId !== selectedUserId), assignment]);
      setReason(""); setMessage("平台授权已更新。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "平台授权更新失败。");
      await load();
    } finally { setBusy(false); }
  }

  if (!canManage) return <p className="text-sm text-amber-100">当前账号没有平台授权管理权限。</p>;
  const userOptions = users.map((item) => ({ label: `${item.displayName || item.email} · ${item.email}`, value: item.id }));
  if (selectedUserId && !userOptions.some((item) => item.value === selectedUserId)) userOptions.unshift({ label: selectedUserId, value: selectedUserId });
  return <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-lg font-semibold">管理员与权限</h2>
      <p className="mt-2 text-sm text-slate-400">平台授权独立于工作区成员身份。变更记录保留原因，并由服务端保护最后一位超级管理员。</p>
      <div className="mt-4 space-y-2">{assignments.map((item) => <button className="w-full rounded-lg border border-white/10 p-3 text-left text-sm hover:bg-white/5 disabled:opacity-50" disabled={busy} key={item.id} onClick={() => onSelectUser(item.userId)} type="button">
        <span className="block text-white">{users.find((user) => user.id === item.userId)?.email ?? item.userId}</span>
        <span className="mt-1 block text-xs text-slate-400">{item.revokedAt ? "已撤销" : item.roleKey === "platform_super_admin" ? "平台超级管理员" : "平台运营管理员"}</span>
      </button>)}</div>
      {loaded && !assignments.length ? <p className="mt-4 text-sm text-slate-400">暂无平台授权记录。</p> : null}
    </div>
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-lg font-semibold">调整平台授权</h2>
      <label className="mt-4 block text-xs text-slate-400">搜索用户<input className={fieldClass} disabled={busy} onChange={(event) => onQueryChange(event.target.value)} value={query} placeholder="邮箱或名称" /></label>
      <div className="mt-3"><MenuSelect disabled={busy} fullWidth label="目标用户" onChange={onSelectUser} options={[{ label: "请选择用户", value: "" }, ...userOptions]} value={selectedUserId ?? ""} /></div>
      <div className="mt-3"><MenuSelect disabled={busy || isSelf || !loaded} fullWidth label="平台角色" onChange={(value) => setRole(value as PlatformRoleKey | "none")} options={roleOptions} value={role} /></div>
      <label className="mt-3 block text-xs text-slate-400">授权变更原因<textarea className={fieldClass} disabled={busy} maxLength={500} onChange={(event) => setReason(event.target.value)} value={reason} placeholder="填写 5 至 500 字的原因" /></label>
      {isSelf ? <p className="mt-2 text-xs text-amber-100">请由另一位超级管理员调整你的平台授权。</p> : null}
      {error ? <p className="mt-3 text-sm text-red-200" role="alert">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-emerald-200" role="status">{message}</p> : null}
      <button className="mt-4 rounded-lg border border-cyan-300/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 disabled:opacity-40" disabled={!loaded || busy || !selectedUserId || isSelf || reason.trim().length < 5 || (role === "none" && (!current || Boolean(current.revokedAt)))} onClick={() => void save()} type="button">{busy ? "正在保存…" : "保存平台授权"}</button>
    </div>
  </section>;
}
