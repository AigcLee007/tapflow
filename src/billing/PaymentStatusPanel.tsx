import React from "react";

import type { WalletPayment } from "./billingApi";

const PAYMENT_STATUS_LABELS: Record<WalletPayment["status"], string> = {
  pending: "等待支付",
  checkout_created: "支付确认中",
  paid: "已支付",
  create_failed: "创建支付失败",
  cancelled: "已取消",
  refund_pending: "退款处理中",
  refunded: "已退款",
  refund_failed: "退款失败",
};

export function PaymentStatusPanel({ payment }: { payment: WalletPayment | null }) {
  if (!payment) return null;
  const isMobile = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches;
  const completed = payment.status === "paid";
  const terminalFailure = ["create_failed", "cancelled", "refunded", "refund_failed"].includes(payment.status);
  const statusClass = `mt-2 text-sm ${completed ? "text-emerald-300" : terminalFailure ? "text-red-300" : "text-amber-200"}`;
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="text-sm font-semibold text-white">支付状态</div>
      <p className={statusClass}>{PAYMENT_STATUS_LABELS[payment.status]}</p>
      {!isMobile && !completed && !terminalFailure && payment.qrCodeUrl ? <img alt="支付二维码" className="mt-3 h-44 w-44 bg-white p-2" src={payment.qrCodeUrl} /> : null}
    </section>
  );
}
