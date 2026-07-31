import React, { useEffect, useState } from "react";

import {
  listAdminRechargePlans,
  listAdminWalletPayments,
  queryAdminWalletPayment,
  refundAdminWalletPayment,
  updateAdminRechargePlan,
  type AdminRechargePlan,
  type AdminWalletPayment,
} from "./adminApi";

export function PaymentManagementPanel() {
  const [plans, setPlans] = useState<AdminRechargePlan[]>([]);
  const [payments, setPayments] = useState<AdminWalletPayment[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [nextPlans, nextPayments] = await Promise.all([listAdminRechargePlans(), listAdminWalletPayments()]);
      setPlans(nextPlans);
      setPayments(nextPayments);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load payment administration");
    }
  };

  useEffect(() => { void refresh(); }, []);

  const patchPlan = (id: string, patch: Partial<AdminRechargePlan>) => {
    setPlans((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };
  const savePlan = async (plan: AdminRechargePlan) => {
    await updateAdminRechargePlan(plan.id, {
      active: plan.active, amountCents: plan.amountCents, credits: plan.credits, name: plan.name,
      reason: "超级管理员调整充值套餐", sortOrder: plan.sortOrder, validityDays: plan.validityDays,
    });
    await refresh();
  };
  const refund = async (payment: AdminWalletPayment) => {
    if (!reason.trim() || !payment.eligible) return;
    await refundAdminWalletPayment(payment.id, reason.trim());
    setReason("");
    await refresh();
  };

  return <section className="rounded border border-white/10 bg-white/[0.04] p-5">
    <h2 className="text-lg font-semibold text-white">充值套餐与支付</h2>
    <p className="mt-2 text-sm text-slate-400">修改仅影响新订单，已支付订单保留下单时的套餐快照。</p>
    {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="text-slate-400"><tr><th>套餐</th><th>金额（分）</th><th>积分</th><th>有效期（天）</th><th>排序</th><th>启用</th><th /></tr></thead>
        <tbody>{plans.map((plan) => <tr className="border-t border-white/10" key={plan.id}>
          <td className="py-2"><input aria-label={`套餐名称：${plan.name}`} className="h-8 rounded border border-white/10 bg-black/25 px-2 text-white" onChange={(event) => patchPlan(plan.id, { name: event.target.value })} value={plan.name} /></td>
          <td><input aria-label={`金额（分）：${plan.name}`} className="h-8 w-24 rounded border border-white/10 bg-black/25 px-2 text-white" min={1} onChange={(event) => patchPlan(plan.id, { amountCents: Number(event.target.value) })} type="number" value={plan.amountCents} /></td>
          <td><input aria-label={`积分：${plan.name}`} className="h-8 w-24 rounded border border-white/10 bg-black/25 px-2 text-white" min={1} onChange={(event) => patchPlan(plan.id, { credits: Number(event.target.value) })} type="number" value={plan.credits} /></td>
          <td><input aria-label={`有效期天数：${plan.name}`} className="h-8 w-20 rounded border border-white/10 bg-black/25 px-2 text-white" min={1} onChange={(event) => patchPlan(plan.id, { validityDays: Number(event.target.value) })} type="number" value={plan.validityDays} /></td>
          <td><input aria-label={`充值套餐排序：${plan.name}`} className="h-8 w-20 rounded border border-white/10 bg-black/25 px-2 text-white" min={0} onChange={(event) => patchPlan(plan.id, { sortOrder: Number(event.target.value) })} type="number" value={plan.sortOrder} /></td>
          <td><input aria-label={`启用充值套餐：${plan.name}`} checked={plan.active} onChange={(event) => patchPlan(plan.id, { active: event.target.checked })} type="checkbox" /></td>
          <td><button aria-label={`保存 ${plan.name}`} className="rounded border border-white/10 px-2 py-1 text-white" onClick={() => void savePlan(plan)} type="button">保存</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="mt-6">
      <h3 className="font-semibold text-white">支付订单</h3>
      <input aria-label="退款原因" className="mt-2 h-9 w-full rounded border border-white/10 bg-black/25 px-2 text-white" onChange={(event) => setReason(event.target.value)} placeholder="填写退款原因" value={reason} />
      {payments.map((payment) => <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 bg-black/20 p-3" key={payment.id}>
        <span className="text-sm text-white">{payment.userEmail ?? "未知用户"} | CNY {(payment.amountCents / 100).toFixed(2)} | {payment.status}</span>
        <span className="flex gap-2">
          <button aria-label={`查询 ${payment.id}`} className="rounded border border-white/10 px-2 py-1 text-sm text-white" onClick={() => void queryAdminWalletPayment(payment.id).then(refresh)} type="button">查询</button>
          <button aria-label={`退款 ${payment.id}`} className="rounded border border-red-300/30 px-2 py-1 text-sm text-red-200 disabled:opacity-50" disabled={!payment.eligible || !reason.trim()} onClick={() => void refund(payment)} type="button">退款</button>
        </span>
      </div>)}
    </div>
  </section>;
}
