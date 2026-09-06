export type AgentDeliveryExpected = { id: string; kind: string };
export type AgentDeliveryActual = { id: string; kind: string; status: string; text?: string; assetId?: string; nodeId?: string; providerJobId?: string; tenantId?: string; flowId?: string };
export type DeliveryCheckResult = { status: "verified" | "partial" | "failed" | "waiting"; items: Array<{ id: string; kind: string; status: string; nodeId?: string; assetId?: string; reason?: string }> };

export function verifyTaskDelivery(input: { tenantId: string; taskId: string; flowId: string; expected: AgentDeliveryExpected[]; actual: AgentDeliveryActual[] }): DeliveryCheckResult {
  const items = input.expected.map((expected) => {
    const actual = input.actual.find((item) => item.id === expected.id);
    if (!actual) return { id: expected.id, kind: expected.kind, status: "waiting", reason: "missing delivery" };
    if ((actual.tenantId && actual.tenantId !== input.tenantId) || (actual.flowId && actual.flowId !== input.flowId)) {
      return { id: expected.id, kind: expected.kind, status: "failed", reason: "delivery lineage mismatch" };
    }
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

export function dedupeDeliveryVerificationEvents<T extends { idempotencyKey: string }>(events: T[]): T[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.idempotencyKey)) return false;
    seen.add(event.idempotencyKey);
    return true;
  });
}

export { sanitizeAgentRuntimeObservability } from "./agent-runtime-observability.js";
export type { AgentRuntimeObservability } from "./agent-runtime-observability.js";
