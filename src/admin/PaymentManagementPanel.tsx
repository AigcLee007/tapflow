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
      reason: "Payment plan update", sortOrder: plan.sortOrder, validityDays: plan.validityDays,
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
    <h2 className="text-lg font-semibold text-white">Payment management</h2>
    {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="text-slate-400"><tr><th>Plan</th><th>Cents</th><th>Credits</th><th>Days</th><th>Order</th><th>Active</th><th /></tr></thead>
        <tbody>{plans.map((plan) => <tr className="border-t border-white/10" key={plan.id}>
          <td className="py-2"><input aria-label={`Plan name for ${plan.name}`} className="h-8 rounded border border-white/10 bg-black/25 px-2 text-white" onChange={(event) => patchPlan(plan.id, { name: event.target.value })} value={plan.name} /></td>
          <td><input aria-label={`Cents for ${plan.name}`} className="h-8 w-24 rounded border border-white/10 bg-black/25 px-2 text-white" min={1} onChange={(event) => patchPlan(plan.id, { amountCents: Number(event.target.value) })} type="number" value={plan.amountCents} /></td>
          <td><input aria-label={`Credits for ${plan.name}`} className="h-8 w-24 rounded border border-white/10 bg-black/25 px-2 text-white" min={1} onChange={(event) => patchPlan(plan.id, { credits: Number(event.target.value) })} type="number" value={plan.credits} /></td>
          <td><input aria-label={`Validity days for ${plan.name}`} className="h-8 w-20 rounded border border-white/10 bg-black/25 px-2 text-white" min={1} onChange={(event) => patchPlan(plan.id, { validityDays: Number(event.target.value) })} type="number" value={plan.validityDays} /></td>
          <td><input aria-label={`Sort order for ${plan.name}`} className="h-8 w-20 rounded border border-white/10 bg-black/25 px-2 text-white" min={0} onChange={(event) => patchPlan(plan.id, { sortOrder: Number(event.target.value) })} type="number" value={plan.sortOrder} /></td>
          <td><input aria-label={`Active for ${plan.name}`} checked={plan.active} onChange={(event) => patchPlan(plan.id, { active: event.target.checked })} type="checkbox" /></td>
          <td><button aria-label={`Save ${plan.name}`} className="rounded border border-white/10 px-2 py-1 text-white" onClick={() => void savePlan(plan)} type="button">Save</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="mt-6">
      <h3 className="font-semibold text-white">Payments</h3>
      <input aria-label="Refund reason" className="mt-2 h-9 w-full rounded border border-white/10 bg-black/25 px-2 text-white" onChange={(event) => setReason(event.target.value)} placeholder="Refund reason" value={reason} />
      {payments.map((payment) => <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 bg-black/20 p-3" key={payment.id}>
        <span className="text-sm text-white">{payment.userEmail ?? "Unknown"} | CNY {(payment.amountCents / 100).toFixed(2)} | {payment.status}</span>
        <span className="flex gap-2">
          <button aria-label={`Query ${payment.id}`} className="rounded border border-white/10 px-2 py-1 text-sm text-white" onClick={() => void queryAdminWalletPayment(payment.id).then(refresh)} type="button">Query</button>
          <button aria-label={`Refund ${payment.id}`} className="rounded border border-red-300/30 px-2 py-1 text-sm text-red-200 disabled:opacity-50" disabled={!payment.eligible || !reason.trim()} onClick={() => void refund(payment)} type="button">Refund</button>
        </span>
      </div>)}
    </div>
  </section>;
}
