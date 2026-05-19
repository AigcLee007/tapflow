import React from "react";

import type { BillingLedgerEntry } from "./billingApi";

const creditTypes = new Set(["redeem", "admin_credit", "payment"]);

export function BillingLedgerTable({ items }: { items: BillingLedgerEntry[] }) {
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="text-sm font-semibold text-white">Ledger</div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">Time</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">Amount</th>
              <th className="py-2 pr-3">Description</th>
              <th className="py-2 pr-3">Idempotency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {items.map((item) => {
              const positive = creditTypes.has(item.entryType);
              return (
                <tr key={item.id} className="text-slate-300">
                  <td className="py-3 pr-3">{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="py-3 pr-3">{item.entryType}</td>
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
                  No ledger entries yet. Redeem a test code or run the local billing seed flow to create activity.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
