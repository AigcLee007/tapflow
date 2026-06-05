import React from "react";

import type { BillingUsageEvent } from "./billingApi";

function statusLabel(status: string) {
  if (status === "settled") return "已结算";
  if (status === "reserved") return "已预占";
  if (status === "refunded") return "已退款";
  if (status === "failed") return "失败";
  return status;
}

function modalityLabel(modality: string) {
  if (modality === "image") return "图片";
  if (modality === "video") return "视频";
  if (modality === "audio") return "音频";
  if (modality === "text") return "文本";
  return modality;
}

export function BillingUsageTable({ items }: { items: BillingUsageEvent[] }) {
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="text-sm font-semibold text-white">用量记录</div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-2 pr-3">时间</th>
              <th className="py-2 pr-3">事件</th>
              <th className="py-2 pr-3">状态</th>
              <th className="py-2 pr-3">类型</th>
              <th className="py-2 pr-3">点数</th>
              <th className="py-2 pr-3">任务</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {items.map((item) => (
              <tr key={item.id} className="text-slate-300">
                <td className="py-3 pr-3">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                <td className="py-3 pr-3">{item.eventType}</td>
                <td className="py-3 pr-3">{statusLabel(item.status)}</td>
                <td className="py-3 pr-3">{modalityLabel(item.modality)}</td>
                <td className="py-3 pr-3 font-semibold text-amber-300">{item.billableCents.toLocaleString()}</td>
                <td className="max-w-[220px] truncate py-3 pr-3 text-xs text-slate-500">{item.workflowRunId || "-"}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={6}>
                  暂无用量记录。完成一次任务后可在这里查看点数消耗。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
