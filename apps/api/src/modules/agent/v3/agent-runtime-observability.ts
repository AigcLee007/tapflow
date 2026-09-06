export type AgentRuntimeObservability = {
  firstEventLatencyMs: number;
  contextSize: number;
  toolRounds: number;
  repairCount: number;
  deliveryDurationMs: number;
  terminalStatus: string;
  billingTotal: number;
};

export type AgentRuntimeObservabilityInput = {
  firstEventAt: number;
  now: number;
  contextSize: number;
  toolRounds: number;
  repairCount: number;
  deliveryDurationMs: number;
  terminalStatus: string;
  billingTotal: number;
  provider?: unknown;
  credentialId?: unknown;
};

export type TerminalDeliveryMetadata = {
  status: "verified" | "partial" | "failed";
  verified: boolean;
  completedSteps: number;
  failedSteps: number;
  invalidSteps: number;
};

export function buildAgentRuntimeObservability(input: AgentRuntimeObservabilityInput): AgentRuntimeObservability {
  return sanitizeAgentRuntimeObservability({
    firstEventLatencyMs: input.now - input.firstEventAt,
    contextSize: input.contextSize,
    toolRounds: input.toolRounds,
    repairCount: input.repairCount,
    deliveryDurationMs: input.deliveryDurationMs,
    terminalStatus: input.terminalStatus,
    billingTotal: input.billingTotal,
  });
}

export function sanitizeAgentRuntimeObservability(value: AgentRuntimeObservability): AgentRuntimeObservability {
  return {
    firstEventLatencyMs: Math.max(0, value.firstEventLatencyMs),
    contextSize: Math.min(100_000, Math.max(0, value.contextSize)),
    toolRounds: Math.min(8, Math.max(0, value.toolRounds)),
    repairCount: Math.min(1, Math.max(0, value.repairCount)),
    deliveryDurationMs: Math.max(0, value.deliveryDurationMs),
    terminalStatus: value.terminalStatus.slice(0, 80),
    billingTotal: Math.max(0, value.billingTotal),
  };
}

export function readTerminalDeliveryMetadata(value: Record<string, unknown>): TerminalDeliveryMetadata | null {
  const delivery = value.delivery;
  if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) return null;
  const candidate = delivery as Record<string, unknown>;
  if (candidate.status !== "verified" && candidate.status !== "partial" && candidate.status !== "failed") return null;
  if (typeof candidate.verified !== "boolean") return null;
  const counts = [candidate.completedSteps, candidate.failedSteps, candidate.invalidSteps];
  if (!counts.every((count) => typeof count === "number" && Number.isInteger(count) && count >= 0 && count <= 100_000)) return null;
  return { status: candidate.status, verified: candidate.verified, completedSteps: counts[0] as number, failedSteps: counts[1] as number, invalidSteps: counts[2] as number };
}
