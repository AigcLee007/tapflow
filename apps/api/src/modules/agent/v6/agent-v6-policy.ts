export type AgentV6RiskPlan = {
  app?: boolean;
  batch?: boolean;
  costCredits?: number;
  skill?: boolean;
  writesCanvas?: boolean;
};

export function requiresV6Confirmation(plan: AgentV6RiskPlan | null | undefined): boolean {
  if (!plan) return false;
  return (plan.costCredits ?? 0) > 0 || plan.batch === true || plan.writesCanvas === true || plan.skill === true || plan.app === true;
}

export function canAutoExecuteV6(plan: AgentV6RiskPlan | null | undefined): boolean {
  return !requiresV6Confirmation(plan);
}
