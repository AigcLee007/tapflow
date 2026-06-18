import React from "react";

import type { BillingUsageEvent } from "./billingApi";
import {
  formatUsageEventLabel,
  formatUsageModel,
  formatUsageParameters,
  formatUsageQuantity,
  formatUsageStatus,
} from "./billingDisplay";

export function BillingUsageTable({ items }: { items: BillingUsageEvent[] }) {
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="text-sm font-semibold text-white">用量记录</div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-2 pr-3">时间</th>
              <th className="py-2 pr-3">事件</th>
              <th className="py-2 pr-3">模型</th>
              <th className="py-2 pr-3">参数</th>
              <th className="py-2 pr-3">数量</th>
              <th className="py-2 pr-3">点数</th>
              <th className="py-2 pr-3">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {items.map((item) => (
              <tr key={item.id} className="text-slate-300">
                <td className="py-3 pr-3">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                <td className="py-3 pr-3">{formatUsageEventLabel(item)}</td>
                <td className="py-3 pr-3">{formatUsageModel(item)}</td>
                <td className="py-3 pr-3">{formatUsageParameters(item)}</td>
                <td className="py-3 pr-3">{formatUsageQuantity(item)}</td>
                <td className="py-3 pr-3 font-semibold text-amber-300">{item.billableCents.toLocaleString()}</td>
                <td className="py-3 pr-3">{formatUsageStatus(item.status)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={7}>
                  暂无用量记录。完成一次生成后可以在这里查看积分消耗。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
