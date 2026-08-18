import React from "react";
import { Loader2 } from "lucide-react";

import type { RechargePlan } from "./billingApi";

export type RechargePanelProps = {
  busyPlanKey: string | null;
  onRetry?: () => void;
  onSelect: (plan: RechargePlan) => Promise<void> | void;
  plans: RechargePlan[];
  status: "idle" | "loading" | "ready" | "error";
};

function formatAmount(cents: number): string {
  return `￥${(cents / 100).toFixed(2)}`;
}

function formatUnitPrice(plan: RechargePlan): string {
  if (plan.credits <= 0) {
    return "积分单价不可用";
  }

  return `约 ￥${(plan.amountCents / plan.credits / 100).toFixed(2)} / 积分`;
}

function sortPlans(plans: RechargePlan[]): RechargePlan[] {
  return plans
    .map((plan, index) => ({ plan, index }))
    .sort((left, right) => {
      if (left.plan.sortOrder === right.plan.sortOrder) {
        return left.index - right.index;
      }

      return left.plan.sortOrder - right.plan.sortOrder;
    })
    .map(({ plan }) => plan);
}

function PlanSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex min-h-[300px] animate-pulse flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4"
      data-testid="recharge-plan-skeleton"
    >
      <div className="h-4 w-24 rounded bg-white/10" />
      <div className="mt-4 h-8 w-20 rounded bg-white/10" />
      <div className="mt-3 h-4 w-32 rounded bg-white/10" />
      <div className="mt-auto h-10 rounded bg-white/10" />
    </div>
  );
}

export function RechargePanel({ busyPlanKey, onRetry, onSelect, plans, status }: RechargePanelProps) {
  const sortedPlans = React.useMemo(() => sortPlans(plans), [plans]);
  const recommendedPlanKey = sortedPlans[1]?.key ?? null;
  const isLoadingLike = status === "idle" || status === "loading";

  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <header className="space-y-2">
        <h2 className="text-sm font-semibold text-white">充值积分</h2>
        <p className="text-xs text-slate-400">一次购买，立即到账，不自动续费</p>
      </header>

      {status === "error" ? (
        <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 p-4 text-sm text-rose-100">
          <p>套餐加载失败</p>
          {onRetry ? (
            <button
              className="mt-3 inline-flex items-center rounded-md border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
              onClick={onRetry}
              type="button"
            >
              重新加载套餐
            </button>
          ) : null}
        </div>
      ) : null}

      {isLoadingLike ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-4" data-testid="recharge-plan-grid">
          <PlanSkeleton />
          <PlanSkeleton />
          <PlanSkeleton />
          <PlanSkeleton />
        </div>
      ) : null}

      {status === "ready" ? (
        sortedPlans.length > 0 ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-4" data-testid="recharge-plan-grid">
            {sortedPlans.map((plan) => {
              const isRecommended = plan.key === recommendedPlanKey;
              const isBusy = busyPlanKey === plan.key;

              return (
                <article
                  className={[
                    "flex min-h-[300px] flex-col rounded-2xl border p-4",
                    isRecommended ? "border-cyan-300/50 bg-cyan-300/8" : "border-white/10 bg-black/20",
                  ].join(" ")}
                  key={plan.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{plan.name}</h3>
                      <p className="mt-1 text-xs text-slate-400">{plan.credits.toLocaleString()} 积分</p>
                    </div>
                    {isRecommended ? (
                      <span className="rounded-full border border-cyan-300/40 bg-cyan-300/12 px-2 py-1 text-[11px] font-semibold text-cyan-100">
                        推荐
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 text-3xl font-semibold text-white">{formatAmount(plan.amountCents)}</div>
                  <p className="mt-2 text-xs text-slate-400">{formatUnitPrice(plan)}</p>
                  <p className="mt-1 text-xs text-slate-400">有效期 {plan.validityDays} 天</p>
                  <span className="sr-only">{plan.credits.toLocaleString()} 积分，有效期 {plan.validityDays} 天</span>

                  <div className="mt-auto pt-4">
                    <button
                      className={[
                        "inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition",
                        isRecommended
                          ? "border-cyan-200 bg-white text-slate-950 hover:bg-cyan-50"
                          : "border-white/10 bg-black/30 text-white hover:bg-white/10",
                        isBusy ? "cursor-wait opacity-70" : "",
                      ].join(" ")}
                      disabled={busyPlanKey !== null}
                      onClick={() => void onSelect(plan)}
                      aria-label={`${formatAmount(plan.amountCents)} 立即充值`}
                      type="button"
                    >
                      {isBusy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
                      立即充值
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-400">
            暂无可用套餐
          </div>
        )
      ) : null}
    </section>
  );
}
