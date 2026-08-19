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

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  credits_100: "轻量尝鲜",
  credits_700: "日常创作",
  credits_1500: "高频创作",
  credits_3300: "专业创作",
};

function formatAmount(cents: number): string {
  return `￥${(cents / 100).toFixed(2)}`;
}

function getBonusBreakdown(plan: RechargePlan): { baseCredits: number; bonusCredits: number } | null {
  const baseCredits = plan.key === "credits_100" ? 100 : Math.floor(plan.amountCents / 10);
  const bonusCredits = Math.max(plan.credits - baseCredits, 0);
  return bonusCredits > 0 ? { baseCredits, bonusCredits } : null;
}

function getPlanDisplayName(plan: RechargePlan): string {
  return PLAN_DISPLAY_NAMES[plan.key] ?? plan.name;
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
              const bonusBreakdown = getBonusBreakdown(plan);

              return (
                <article
                  className={[
                    "flex min-h-[300px] flex-col rounded-2xl border p-4 transition duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(34,211,238,0.12)] focus-within:-translate-y-1 focus-within:shadow-[0_16px_36px_rgba(34,211,238,0.12)] motion-reduce:transform-none motion-reduce:transition-none",
                    isRecommended ? "border-cyan-300/50 bg-cyan-300/8" : "border-white/10 bg-black/20",
                  ].join(" ")}
                  key={plan.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{getPlanDisplayName(plan)}</h3>
                    </div>
                    {isRecommended ? (
                      <span className="rounded-full border border-cyan-300/40 bg-cyan-300/12 px-2 py-1 text-[11px] font-semibold text-cyan-100">
                        推荐
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 text-3xl font-semibold text-white">{plan.credits.toLocaleString()} 积分</div>
                  {bonusBreakdown ? <p className="mt-2 text-xs text-slate-300">基础 {bonusBreakdown.baseCredits.toLocaleString()} + <span className="font-semibold text-cyan-300">加赠 {bonusBreakdown.bonusCredits.toLocaleString()}</span></p> : null}
                  <div className={bonusBreakdown ? "mt-4 text-2xl font-semibold text-white" : "mt-5 text-2xl font-semibold text-white"}>{formatAmount(plan.amountCents)}</div>
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
