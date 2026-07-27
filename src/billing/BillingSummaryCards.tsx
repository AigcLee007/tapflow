import React from "react";
import { CircleDollarSign, Clock3, LockKeyhole, Timer } from "lucide-react";

import type { BillingSummary } from "./billingApi";

const credits = (value: number) => Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);

export function BillingSummaryCards({ summary }: { summary: BillingSummary | null }) {
  const cards = [
    { icon: CircleDollarSign, label: "Available credits", value: credits(summary?.availableCredits ?? 0), hint: "Ready to use" },
    { icon: LockKeyhole, label: "Reserved credits", value: credits(summary?.reservedCredits ?? 0), hint: "Held for active jobs" },
    { icon: Clock3, label: "Expiring soon", value: credits(summary?.expiringSoonCredits ?? 0), hint: "Expires within 30 days" },
    { icon: Timer, label: "Nearest expiry", value: summary?.nearestExpiryAt ? new Date(summary.nearestExpiryAt).toLocaleDateString("zh-CN") : "None", hint: "Oldest credits spend first" },
  ];
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{cards.map((card) => { const Icon = card.icon; return <section className="rounded border border-white/10 bg-white/[0.04] p-4" key={card.label}><div className="flex items-center gap-2 text-sm text-slate-300"><Icon size={16} />{card.label}</div><div className="mt-3 text-2xl font-semibold text-white">{card.value}</div><div className="mt-1 text-xs text-slate-500">{card.hint}</div></section>; })}</div>;
}
