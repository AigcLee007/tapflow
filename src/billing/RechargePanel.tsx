import React from "react";
import { Loader2 } from "lucide-react";
import type { RechargePlan } from "./billingApi";

export type RechargePanelProps = { busyPlanKey: string | null; onRetry?: () => void; onSelect: (plan: RechargePlan) => Promise<void> | void; plans: RechargePlan[]; status: "idle" | "loading" | "ready" | "error" };

type PlanPresentation = { name: string; baseCredits: number; bonusCredits: number; description: string };
const PLAN_PRESENTATIONS: Record<string, { name: string; description: string }> = {
  credits_100: { name: "轻量尝鲜", description: "快速试用基础创作能力" },
  credits_700: { name: "日常创作", description: "满足日常图片与视频创作" },
  credits_1500: { name: "高频创作", description: "适合持续产出与批量创作" },
  credits_3300: { name: "专业创作", description: "为专业项目提供充足额度" },
};

export function getPlanPresentation(plan: RechargePlan): PlanPresentation {
  const baseCredits = plan.key === "credits_100" ? 100 : Math.max(0, Math.round((plan.amountCents / 100) * 10));
  const defaults = PLAN_PRESENTATIONS[plan.key];
  return { name: defaults?.name ?? plan.name, baseCredits, bonusCredits: Math.max(0, plan.credits - baseCredits), description: defaults?.description ?? "按需购买创作积分" };
}
function formatAmount(cents: number) { return `￥${(cents / 100).toFixed(2)}`; }
function sortPlans(plans: RechargePlan[]) { return plans.map((plan, index) => ({ plan, index })).sort((a, b) => a.plan.sortOrder - b.plan.sortOrder || a.index - b.index).map(({ plan }) => plan); }
function PlanSkeleton() { return <div aria-hidden="true" className="flex min-h-[300px] animate-pulse flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid="recharge-plan-skeleton"><div className="h-4 w-24 rounded bg-white/10" /><div className="mt-4 h-8 w-20 rounded bg-white/10" /><div className="mt-3 h-4 w-32 rounded bg-white/10" /><div className="mt-auto h-10 rounded bg-white/10" /></div>; }

export function RechargePanel({ busyPlanKey, onRetry, onSelect, plans, status }: RechargePanelProps) {
  const sortedPlans = React.useMemo(() => sortPlans(plans), [plans]);
  const recommendedPlanKey = sortedPlans[1]?.key ?? null;
  const [activePlanKey, setActivePlanKey] = React.useState<string | null>(recommendedPlanKey);
  React.useEffect(() => setActivePlanKey(recommendedPlanKey), [recommendedPlanKey]);
  const isLoadingLike = status === "idle" || status === "loading";
  return <section className="rounded border border-white/10 bg-white/[0.04] p-4"><header><h2 className="text-sm font-semibold text-white">充值积分</h2></header>
    {status === "error" ? <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/8 p-4 text-sm text-rose-100"><p>套餐加载失败</p>{onRetry ? <button className="mt-3 inline-flex items-center rounded-md border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15" onClick={onRetry} type="button">重新加载套餐</button> : null}</div> : null}
    {isLoadingLike ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="recharge-plan-grid"><PlanSkeleton /><PlanSkeleton /><PlanSkeleton /><PlanSkeleton /></div> : null}
    {status === "ready" ? sortedPlans.length > 0 ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="recharge-plan-grid">{sortedPlans.map((plan) => { const p = getPlanPresentation(plan); const recommended = plan.key === recommendedPlanKey; const active = plan.key === activePlanKey; const busy = busyPlanKey === plan.key; return <article className={["relative flex min-h-[300px] flex-col rounded-2xl border p-4 transition motion-reduce:transition-none", active ? "-translate-y-1 border-lime-300 bg-lime-300/10 shadow-[0_14px_32px_rgba(163,230,53,0.18)] ring-2 ring-lime-300" : "border-white/10 bg-black/20 hover:-translate-y-1 hover:border-lime-300/70"].join(" ")} data-testid="recharge-plan-card" key={plan.id} onMouseEnter={() => setActivePlanKey(plan.key)} onMouseLeave={() => setActivePlanKey(recommendedPlanKey)} onFocus={() => setActivePlanKey(plan.key)} onBlur={() => setActivePlanKey(recommendedPlanKey)}>{recommended ? <span className="absolute -top-3 left-4 rounded-full border border-lime-300/60 bg-lime-300 px-3 py-1 text-[11px] font-bold text-slate-950">最受欢迎</span> : null}<h3 className="text-sm font-semibold text-white">{p.name}</h3><p className="mt-1 text-xs text-slate-300">{plan.credits.toLocaleString()} 积分</p>{p.bonusCredits > 0 ? <p className="mt-3 text-xs font-semibold text-lime-200">加赠 {p.bonusCredits.toLocaleString()} 积分</p> : <p className="mt-3 text-xs text-slate-400">基础积分</p>}<div className="mt-4 text-3xl font-semibold text-white">{formatAmount(plan.amountCents)}</div><p className="mt-2 text-xs text-slate-400">有效期 {plan.validityDays} 天</p><p className="mt-2 text-xs leading-5 text-slate-400">{p.description}</p><div className="mt-auto pt-4"><button className={["inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition", active ? "border-lime-200 bg-lime-300 text-slate-950 hover:bg-lime-200" : "border-white/10 bg-black/30 text-white hover:bg-white/10", busy ? "cursor-wait opacity-70" : ""].join(" ")} disabled={busyPlanKey !== null} onClick={() => void onSelect(plan)} type="button">{busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}立即充值</button></div></article>; })}</div> : <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-400">暂无可用套餐</div> : null}
  </section>;
}
