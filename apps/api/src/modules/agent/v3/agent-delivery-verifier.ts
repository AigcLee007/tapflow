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
