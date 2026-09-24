import React, { useEffect, useRef, useState } from "react";

import {
  listAdminRechargePlans,
  listAdminWalletPayments,
  queryAdminWalletPayment,
  refundAdminWalletPayment,
  updateAdminRechargePlan,
  type AdminRechargePlan,
  type AdminWalletPayment,
} from "./adminApi";

const PAYMENT_STATUS: Record<string, string> = { pending: "待支付", checkout_created: "待支付", paid: "已支付", create_failed: "创建失败", cancelled: "已取消", refund_pending: "退款处理中", refunded: "已退款", refund_failed: "退款失败" };

function PaymentOrder({ payment, canManage, onRefresh }: { payment: AdminWalletPayment; canManage: boolean; onRefresh: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const busy = useRef(false);
  const act = async (action: "query" | "refund") => {
    if (!canManage || busy.current || (action === "refund" && (!payment.eligible || !reason.trim()))) return;
    busy.current = true; setPending(true); setFeedback(null);
    try {
      const result = action === "refund" ? await refundAdminWalletPayment(payment.id, reason.trim()) : await queryAdminWalletPayment(payment.id);
      setFeedback(action === "refund" ? (result.status === "refunded" ? "已退款。" : "退款申请已提交，请以订单最终状态为准。") : "订单状态已同步。");
      if (action === "refund") setReason("");
      await onRefresh();
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : "订单操作失败，请重试。"); }
    finally { busy.current = false; setPending(false); }
  };
  return <article className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="break-all text-sm text-white">{payment.userEmail ?? "未知用户"} · {payment.currency ?? "CNY"} {(payment.amountCents / 100).toFixed(2)}</p><p className="mt-1 break-all text-xs text-slate-400">{payment.merchantOrderId} · {payment.planNameSnapshot ?? payment.planKey} · {payment.credits} 积分</p><p className="mt-1 text-xs text-slate-500">{new Date(payment.createdAt).toLocaleString()}</p></div>
      <span className="text-xs text-lime-200">{PAYMENT_STATUS[payment.status] ?? payment.status}</span>
    </div>
    {canManage ? <div className="mt-3 flex flex-wrap gap-2">
      <input aria-label={`退款原因 ${payment.id}`} className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white disabled:opacity-50" disabled={pending} maxLength={80} onChange={event => setReason(event.target.value)} placeholder="填写这笔订单的退款原因" value={reason} />
      <button aria-label={`查询 ${payment.id}`} className="rounded-lg border border-white/10 px-3 text-xs text-white disabled:opacity-50" disabled={pending} onClick={() => void act("query")} type="button">同步状态</button>
      <button aria-label={`退款 ${payment.id}`} className="rounded-lg border border-red-300/30 px-3 text-xs text-red-200 disabled:opacity-50" disabled={pending || !payment.eligible || !reason.trim()} onClick={() => void act("refund")} type="button">{pending ? "处理中…" : "申请退款"}</button>
    </div> : null}
    {feedback ? <p className="mt-2 text-xs text-slate-300" role="status">{feedback}</p> : null}
  </article>;
}

export function PaymentManagementPanel({ canManage = false, mode = "all" }: { canManage?: boolean; mode?: "all" | "payments" | "plans" } = {}) {
  const [plans, setPlans] = useState<AdminRechargePlan[]>([]);
  const [payments, setPayments] = useState<AdminWalletPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const savingRef = useRef(false);
  const showPlans = canManage && mode !== "payments";
  const showOrders = mode !== "plans";

  const refresh = async () => {
    try {
      const [nextPlans, nextPayments] = await Promise.all([showPlans ? listAdminRechargePlans() : Promise.resolve([]), showOrders ? listAdminWalletPayments() : Promise.resolve([])]);
      setPlans(nextPlans);
      setPayments(nextPayments);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load payment administration");
    }
  };

  useEffect(() => { setPlans([]); setPayments([]); void refresh(); }, [canManage, mode]);

  const patchPlan = (id: string, patch: Partial<AdminRechargePlan>) => {
    setPlans((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };
  const savePlan = async (plan: AdminRechargePlan) => {
    if (!canManage || savingRef.current) return;
    savingRef.current = true; setSaving(plan.id);
    try { await updateAdminRechargePlan(plan.id, {
      active: plan.active, amountCents: plan.amountCents, credits: plan.credits, name: plan.name,
      reason: "超级管理员调整充值套餐", sortOrder: plan.sortOrder, validityDays: plan.validityDays,
    });
    await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，请重试。"); }
    finally { savingRef.current = false; setSaving(null); }
  };

  return <section className="rounded border border-white/10 bg-white/[0.04] p-5">
    <h2 className="text-lg font-semibold text-white">{showPlans ? (showOrders ? "充值套餐与支付" : "充值套餐") : "支付订单"}</h2>
    <p className="mt-2 text-sm text-slate-400">{canManage ? "修改仅影响新订单，已支付订单保留下单时的套餐快照。" : "查看支付订单状态。退款、支付查询同步和套餐调整由超级管理员处理。"}</p>
    {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    {showPlans ? <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="text-slate-400"><tr><th>套餐</th><th>金额（分）</th><th>积分</th><th>有效期（天）</th><th>排序</th><th>启用</th><th /></tr></thead>
        <tbody>{plans.map((plan) => <tr className="border-t border-white/10" key={plan.id}>
          <td className="py-2"><input aria-label={`套餐名称：${plan.name}`} className="h-8 rounded border border-white/10 bg-black/25 px-2 text-white" onChange={(event) => patchPlan(plan.id, { name: event.target.value })} value={plan.name} /></td>
          <td><input aria-label={`金额（分）：${plan.name}`} className="h-8 w-24 rounded border border-white/10 bg-black/25 px-2 text-white" min={1} onChange={(event) => patchPlan(plan.id, { amountCents: Number(event.target.value) })} type="number" value={plan.amountCents} /></td>
          <td><input aria-label={`积分：${plan.name}`} className="h-8 w-24 rounded border border-white/10 bg-black/25 px-2 text-white" min={1} onChange={(event) => patchPlan(plan.id, { credits: Number(event.target.value) })} type="number" value={plan.credits} /></td>
          <td><input aria-label={`有效期天数：${plan.name}`} className="h-8 w-20 rounded border border-white/10 bg-black/25 px-2 text-white" min={1} onChange={(event) => patchPlan(plan.id, { validityDays: Number(event.target.value) })} type="number" value={plan.validityDays} /></td>
          <td><input aria-label={`充值套餐排序：${plan.name}`} className="h-8 w-20 rounded border border-white/10 bg-black/25 px-2 text-white" min={0} onChange={(event) => patchPlan(plan.id, { sortOrder: Number(event.target.value) })} type="number" value={plan.sortOrder} /></td>
          <td><input aria-label={`启用充值套餐：${plan.name}`} checked={plan.active} onChange={(event) => patchPlan(plan.id, { active: event.target.checked })} type="checkbox" /></td>
          <td><button aria-label={`保存 ${plan.name}`} className="rounded border border-white/10 px-2 py-1 text-white disabled:opacity-50" disabled={saving !== null} onClick={() => void savePlan(plan)} type="button">{saving === plan.id ? "保存中…" : "保存"}</button></td>
        </tr>)}</tbody>
      </table>
    </div> : null}
    {showOrders ? <div className="mt-6">
      <h3 className="font-semibold text-white">支付订单</h3>
      <p className="mt-1 text-xs text-slate-400">现金退款与生成失败释放积分分别处理。仅未使用、未预留的充值积分可申请整单退款。</p>
      {payments.map(payment => <PaymentOrder key={payment.id} payment={payment} canManage={canManage} onRefresh={refresh} />)}
      {!error && !payments.length ? <p className="mt-3 text-sm text-slate-400">暂无订单。</p> : null}
    </div> : null}
  </section>;
}
