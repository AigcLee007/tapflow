import React from "react";

import type { BillingActivityRow } from "./billingActivity";

function formatCredits(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  const normalized = Math.abs(value);
  const text = Number.isInteger(normalized) ? normalized.toLocaleString() : normalized.toFixed(1);
  return `${prefix}${text}`;
}

export function BillingActivityTable({ items }: { items: BillingActivityRow[] }) {
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="text-sm font-semibold text-white">账单明细</div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-2 pr-3">时间</th>
              <th className="py-2 pr-3">事件</th>
              <th className="py-2 pr-3">模型线路</th>
              <th className="py-2 pr-3">参数</th>
              <th className="py-2 pr-3">数量</th>
              <th className="py-2 pr-3">积分变动</th>
              <th className="py-2 pr-3">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {items.map((item) => (
              <tr key={item.id} className="text-slate-300">
                <td className="py-3 pr-3">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                <td className="py-3 pr-3">{item.eventLabel}</td>
                <td className="py-3 pr-3">{item.modelLabel}</td>
                <td className="py-3 pr-3">{item.parameterLabel}</td>
                <td className="py-3 pr-3">{item.quantityLabel}</td>
                <td
                  className={`py-3 pr-3 font-semibold ${
                    item.credits > 0 ? "text-emerald-300" : item.credits < 0 ? "text-amber-300" : "text-slate-300"
                  }`}
                >
                  {formatCredits(item.credits)}
                </td>
                <td className="py-3 pr-3">{item.statusLabel}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={7}>
                  暂无账单明细。完成一次生成、充值或兑换后会在这里显示。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
