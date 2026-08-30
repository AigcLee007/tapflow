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
