import type { AgentV3GoldenTask } from '../../../../apps/api/test/fixtures/agent-v3-golden-tasks';

export type AgentV3Actual = {
  planActions: string[];
  requiresApproval: boolean;
  targetNodeKinds: string[];
  terminalDelivery?: {
    kind: 'text' | 'image' | 'video' | 'graph' | 'partial';
    assetId?: string;
    graphId?: string;
    deliveryId?: string;
    text?: string;
    reason?: string;
  };
  paidStepIds: string[];
};

export type AgentV3TaskScore = {
  planActionsMatch: boolean;
  approvalPolicyMatch: boolean;
  targetKindsMatch: boolean;
  terminalDeliveryEvidence: boolean;
  duplicatePaidStepPrevented: boolean;
  score: number;
};

const same = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const hasTerminalEvidence = (
  actual: AgentV3Actual['terminalDelivery'],
  expectedKind: AgentV3GoldenTask['expected']['deliveryKind'],
) => {
  if (!expectedKind || !actual || actual.kind !== expectedKind) return false;
  if (expectedKind === 'image' || expectedKind === 'video') return Boolean(actual.assetId || actual.deliveryId);
  if (expectedKind === 'graph') return Boolean(actual.graphId || actual.deliveryId);
  if (expectedKind === 'partial') return Boolean(actual.deliveryId || actual.reason);
  return Boolean(actual.deliveryId);
};

export function scoreAgentV3Task(
  actual: AgentV3Actual,
  expected: AgentV3GoldenTask['expected'],
): AgentV3TaskScore {
  const planActionsMatch = same(actual.planActions, expected.planActions);
  const approvalPolicyMatch = actual.requiresApproval === expected.requiresApproval;
  const targetKindsMatch = expected.targetNodeKinds
    ? same(actual.targetNodeKinds, expected.targetNodeKinds)
    : true;
  const terminalDeliveryEvidence = hasTerminalEvidence(actual.terminalDelivery, expected.deliveryKind);
  const duplicatePaidStepPrevented = new Set(actual.paidStepIds).size === actual.paidStepIds.length;
  const checks = [
    planActionsMatch,
    approvalPolicyMatch,
    targetKindsMatch,
    terminalDeliveryEvidence,
    duplicatePaidStepPrevented,
  ];
  return {
    planActionsMatch,
    approvalPolicyMatch,
    targetKindsMatch,
    terminalDeliveryEvidence,
    duplicatePaidStepPrevented,
    score: checks.filter(Boolean).length / checks.length,
  };
}
