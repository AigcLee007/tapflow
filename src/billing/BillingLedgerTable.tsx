import React from "react";

import type { BillingLedgerEntry } from "./billingApi";

const CREDIT_ENTRY_TYPES = new Set(["refund", "redeem", "admin_credit", "payment"]);
const DEBIT_ENTRY_TYPES = new Set(["reserve", "settle", "admin_debit"]);

function getLedgerDisplayDirection(entryType: string): "credit" | "debit" {
  if (CREDIT_ENTRY_TYPES.has(entryType)) return "credit";
  if (DEBIT_ENTRY_TYPES.has(entryType)) return "debit";
  return "debit";
}

function entryTypeLabel(entryType: string) {
  if (entryType === "refund") return "退款";
  if (entryType === "redeem") return "兑换";
  if (entryType === "admin_credit") return "后台发放";
  if (entryType === "payment") return "支付";
  if (entryType === "reserve") return "预占";
  if (entryType === "settle") return "结算";
  if (entryType === "admin_debit") return "后台扣减";
  return entryType;
}

export function BillingLedgerTable({ items }: { items: BillingLedgerEntry[] }) {
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="text-sm font-semibold text-white">账单流水</div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-2 pr-3">时间</th>
              <th className="py-2 pr-3">类型</th>
              <th className="py-2 pr-3">数量</th>
              <th className="py-2 pr-3">说明</th>
              <th className="py-2 pr-3">幂等键</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {items.map((item) => {
              const direction = getLedgerDisplayDirection(item.entryType);
              const positive = direction === "credit";
              return (
                <tr key={item.id} className="text-slate-300">
                  <td className="py-3 pr-3">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                  <td className="py-3 pr-3">{entryTypeLabel(item.entryType)}</td>
                  <td className={`py-3 pr-3 font-semibold ${positive ? "text-emerald-300" : "text-amber-300"}`}>
                    {positive ? "+" : "-"}
                    {item.amountCents.toLocaleString()}
                  </td>
                  <td className="py-3 pr-3">{item.description || "-"}</td>
                  <td className="max-w-[260px] truncate py-3 pr-3 text-xs text-slate-500">{item.idempotencyKey}</td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={5}>
                  暂无账单流水。兑换点数或运行任务后会生成记录。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
