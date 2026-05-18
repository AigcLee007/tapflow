import React, { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

import { createPaymentCheckout } from "./billingApi";

export function RechargePanel({ onCreated }: { onCreated: () => Promise<void> | void }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const createPendingPayment = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await createPaymentCheckout({
        amountCents: 1000,
        credits: 1000,
        idempotencyKey: `payment-ui:${Date.now()}`,
      });
      setMessage(`Payment record ${result.payment.id} is ${result.payment.status}.`);
      await onCreated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to create payment record.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <CreditCard size={16} />
        Recharge
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Payment provider checkout is reserved as a server-side flow. Sprint 5 creates an auditable pending payment record.
      </p>
      <button
        className="mt-3 inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15 disabled:opacity-60"
        disabled={loading}
        onClick={() => void createPendingPayment()}
        type="button"
      >
        {loading ? <Loader2 className="animate-spin" size={15} /> : <CreditCard size={15} />}
        Create Pending Recharge
      </button>
      {message && <div className="mt-2 text-xs text-slate-400">{message}</div>}
    </section>
  );
}
