export type AgentApprovalInput = {
  mode: "auto" | "manual_confirmation";
  requiresConfirmation: boolean;
  pricing: { active: boolean; credits: number } | null;
  route: { active: boolean } | null;
  permission: boolean;
  expectedGraphRevision: number;
  currentGraphRevision: number;
};

export type AgentApprovalResult =
  | { allowed: true; failClosed: false }
  | { allowed: false; failClosed: true; reason: "pricing_or_route_missing" | "permission_denied" | "graph_revision_conflict" | "confirmation_required" };

export function evaluateAgentApprovalPolicy(input: AgentApprovalInput): AgentApprovalResult {
  if (!input.pricing || !input.route || !input.pricing.active || !input.route.active || !Number.isFinite(input.pricing.credits) || input.pricing.credits < 0) {
    return { allowed: false, failClosed: true, reason: "pricing_or_route_missing" };
  }
  if (!input.permission) return { allowed: false, failClosed: true, reason: "permission_denied" };
  if (input.expectedGraphRevision !== input.currentGraphRevision) return { allowed: false, failClosed: true, reason: "graph_revision_conflict" };
  if (input.mode === "manual_confirmation" && input.requiresConfirmation) return { allowed: false, failClosed: true, reason: "confirmation_required" };
  return { allowed: true, failClosed: false };
}

export function requiresAgentApproval(input: { mode: "auto" | "manual_confirmation"; paid?: boolean; batch?: boolean; writesCanvas?: boolean; runsSkill?: boolean; runsApp?: boolean }): boolean {
  return input.mode === "manual_confirmation" || Boolean(input.paid || input.batch || input.writesCanvas || input.runsSkill || input.runsApp);
}
