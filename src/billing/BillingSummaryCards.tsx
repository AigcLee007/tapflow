import React from "react";
import { CircleDollarSign, LockKeyhole, ReceiptText, TrendingDown } from "lucide-react";

import type { BillingSummary } from "./billingApi";

const formatCredits = (value: number) => `${value.toLocaleString()} 点`;

export function BillingSummaryCards({ summary }: { summary: BillingSummary | null }) {
  const account = summary?.account;
  const available = Math.max((account?.balanceCents ?? 0) - (account?.reservedCents ?? 0), 0);

  const cards = [
    {
      icon: CircleDollarSign,
      label: "余额",
      value: formatCredits(account?.balanceCents ?? 0),
      hint: `可用 ${formatCredits(available)}`,
    },
    {
      icon: LockKeyhole,
      label: "已占用",
      value: formatCredits(account?.reservedCents ?? 0),
      hint: "用于运行中任务的预占点数",
    },
    {
      icon: TrendingDown,
      label: "本月用量",
      value: formatCredits(summary?.usageTotals.totalBillableCents ?? 0),
      hint: `已结算 ${summary?.usageTotals.settledCount ?? 0} 次`,
    },
    {
      icon: ReceiptText,
      label: "账单流水",
      value: formatCredits(summary?.ledgerTotals.settleCents ?? 0),
      hint: `已退款 ${formatCredits(summary?.ledgerTotals.refundCents ?? 0)}`,
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <section key={card.label} className="rounded border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Icon size={16} />
              {card.label}
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">{card.value}</div>
            <div className="mt-1 text-xs text-slate-500">{card.hint}</div>
          </section>
        );
      })}
    </div>
  );
}
