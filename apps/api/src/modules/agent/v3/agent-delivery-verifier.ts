export type AgentDeliveryExpected = { id: string; kind: string };
export type AgentDeliveryActual = { id: string; kind: string; status: string; text?: string; assetId?: string; nodeId?: string; providerJobId?: string };
export type DeliveryCheckResult = { status: "verified" | "partial" | "failed" | "waiting"; items: Array<{ id: string; kind: string; status: string; nodeId?: string; assetId?: string; reason?: string }> };

export function verifyTaskDelivery(input: { tenantId: string; taskId: string; flowId: string; expected: AgentDeliveryExpected[]; actual: AgentDeliveryActual[] }): DeliveryCheckResult {
  const items = input.expected.map((expected) => {
    const actual = input.actual.find((item) => item.id === expected.id);
    if (!actual) return { id: expected.id, kind: expected.kind, status: "waiting", reason: "missing delivery" };
    if (actual.status !== "succeeded") return { id: expected.id, kind: expected.kind, status: actual.status, reason: actual.status === "running" ? "run not terminal" : "step failed" };
    const valid = expected.kind === "text" ? Boolean(actual.text?.trim()) : Boolean(actual.assetId && actual.nodeId);
    return { id: expected.id, kind: expected.kind, status: valid ? "verified" : "failed", ...(actual.nodeId ? { nodeId: actual.nodeId } : {}), ...(actual.assetId ? { assetId: actual.assetId } : {}), ...(valid ? {} : { reason: "terminal output lacks placement evidence" }) };
  });
  const verified = items.filter((item) => item.status === "verified").length;
  const status = verified === items.length && items.length > 0 ? "verified" : verified > 0 ? "partial" : items.some((item) => item.status === "waiting") ? "waiting" : "failed";
  return { status, items };
}

export function retryFailedSteps<T extends { id: string; status: string; retryCount?: number; idempotencyKey?: string }>(steps: T[]): T[] {
  return steps.filter((step) => step.status === "failed").map((step) => ({ ...step, retryCount: (step.retryCount ?? 0) + 1, idempotencyKey: `retry:${step.id}:${(step.retryCount ?? 0) + 1}`, status: "pending" }));
}

export type AgentRuntimeObservability = { firstEventLatencyMs: number; contextSize: number; toolRounds: number; repairCount: number; deliveryDurationMs: number; terminalStatus: string; billingTotal: number };
export function sanitizeAgentRuntimeObservability(value: AgentRuntimeObservability): AgentRuntimeObservability { return { firstEventLatencyMs: Math.max(0, value.firstEventLatencyMs), contextSize: Math.min(100_000, Math.max(0, value.contextSize)), toolRounds: Math.min(8, Math.max(0, value.toolRounds)), repairCount: Math.min(1, Math.max(0, value.repairCount)), deliveryDurationMs: Math.max(0, value.deliveryDurationMs), terminalStatus: value.terminalStatus.slice(0, 80), billingTotal: Math.max(0, value.billingTotal) }; }
