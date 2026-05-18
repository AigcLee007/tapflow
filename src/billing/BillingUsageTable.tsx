import React from "react";

import type { BillingUsageEvent } from "./billingApi";

export function BillingUsageTable({ items }: { items: BillingUsageEvent[] }) {
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="text-sm font-semibold text-white">Usage Events</div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">Time</th>
              <th className="py-2 pr-3">Event</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Modality</th>
              <th className="py-2 pr-3">Credits</th>
              <th className="py-2 pr-3">Workflow</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {items.map((item) => (
              <tr key={item.id} className="text-slate-300">
                <td className="py-3 pr-3">{new Date(item.createdAt).toLocaleString()}</td>
                <td className="py-3 pr-3">{item.eventType}</td>
                <td className="py-3 pr-3">{item.status}</td>
                <td className="py-3 pr-3">{item.modality}</td>
                <td className="py-3 pr-3 font-semibold text-amber-300">{item.billableCents.toLocaleString()}</td>
                <td className="max-w-[220px] truncate py-3 pr-3 text-xs text-slate-500">{item.workflowRunId || "-"}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={6}>
                  No usage events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
