import React from "react";

import type { WalletPayment } from "./billingApi";

export function PaymentStatusPanel({ payment }: { payment: WalletPayment | null }) {
  if (!payment) return null;
  const isMobile = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches;
  const completed = payment.status === "paid";
  const terminalFailure = ["create_failed", "cancelled", "refunded", "refund_failed"].includes(payment.status);
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="text-sm font-semibold text-white">Payment status</div>
      <p className={`mt-2 text-sm ${completed ? "text-emerald-300" : terminalFailure ? "text-red-300" : "text-amber-200"}`}>{completed ? "Paid" : terminalFailure ? "Unavailable" : "Confirming payment"}</p>
      {!isMobile && !completed && !terminalFailure && payment.qrCodeUrl ? <img alt="Payment QR code" className="mt-3 h-44 w-44 bg-white p-2" src={payment.qrCodeUrl} /> : null}
    </section>
  );
}
