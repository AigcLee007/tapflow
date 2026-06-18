import React from "react";
import { CircleDollarSign, Clock3, Infinity, LockKeyhole } from "lucide-react";

import type { BillingSummary } from "./billingApi";

const formatCredits = (value: number) => `${value.toLocaleString()} 点`;

function membershipLabel(tier?: string) {
  if (tier === "silver") return "白银会员";
  if (tier === "gold") return "黄金会员";
  if (tier === "platinum") return "至尊会员";
  return "普通用户";
}

function discountLabel(multiplier?: number) {
  if (!multiplier || multiplier >= 1) return "暂无生成折扣";
  const discount = Math.round(multiplier * 100) / 10;
  return `${discount} 折生成`;
}

export function BillingSummaryCards({ summary }: { summary: BillingSummary | null }) {
  const account = summary?.account;
  const fallbackAvailable = Math.max((account?.balanceCents ?? 0) - (account?.reservedCents ?? 0), 0);
  const available = summary?.creditGrants?.availableCredits ?? fallbackAvailable;
  const reserved = summary?.creditGrants?.reservedCredits ?? account?.reservedCents ?? 0;
  const expiringSoon = summary?.creditGrants?.expiringSoonCredits ?? 0;
  const lifetime = summary?.creditGrants?.lifetimeCredits ?? available;

  const cards = [
    {
      icon: CircleDollarSign,
      label: "可用积分",
      value: formatCredits(available),
      hint: `预占 ${formatCredits(reserved)}`,
    },
    {
      icon: LockKeyhole,
      label: "会员等级",
      value: membershipLabel(summary?.membership?.tier),
      hint: discountLabel(summary?.membership?.discountMultiplier),
    },
    {
      icon: Clock3,
      label: "30 天内过期",
      value: formatCredits(expiringSoon),
      hint: "系统会优先消耗最快过期的积分",
    },
    {
      icon: Infinity,
      label: "长期积分",
      value: formatCredits(lifetime),
      hint: "长期积分会在限时积分之后消耗",
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
