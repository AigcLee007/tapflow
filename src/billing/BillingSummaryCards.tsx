import React from "react";
import { CircleDollarSign, Clock3, LockKeyhole, Timer } from "lucide-react";

import type { BillingSummary } from "./billingApi";

const credits = (value: number) => Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);

export function BillingSummaryCards({ summary }: { summary: BillingSummary | null }) {
  const cards = [
    { icon: CircleDollarSign, label: "可用积分", value: summary ? credits(summary.availableCredits) : "--", hint: "可直接使用" },
    { icon: LockKeyhole, label: "预留积分", value: summary ? credits(summary.reservedCredits) : "--", hint: "正在执行的任务占用" },
    { icon: Clock3, label: "即将到期", value: summary ? credits(summary.expiringSoonCredits) : "--", hint: "30 天内到期" },
    { icon: Timer, label: "最近到期", value: !summary ? "--" : summary.nearestExpiryAt ? new Date(summary.nearestExpiryAt).toLocaleDateString("zh-CN") : "暂无", hint: "优先使用最早到期的积分" },
  ];
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{cards.map((card) => { const Icon = card.icon; return <section className="rounded border border-white/10 bg-white/[0.04] p-4" key={card.label}><div className="flex items-center gap-2 text-sm text-slate-300"><Icon size={16} />{card.label}</div><div className="mt-3 text-2xl font-semibold text-white">{card.value}</div><div className="mt-1 text-xs text-slate-500">{card.hint}</div></section>; })}</div>;
}
