export type V4TerminalItem = { itemId: string; status: "succeeded" | "failed" | "cancelled"; assetId?: string; errorCode?: string };
export type V4TaskEventWriter = { appendEvent(input: { tenantId: string; sessionId: string; taskId: string; agentNamespace: string; agentVersion: "v4"; eventType: string; eventJson: Record<string, unknown>; idempotencyKey: string }): Promise<unknown>; updateTask(input: { tenantId: string; status: string; outputJson?: Record<string, unknown>; errorJson?: Record<string, unknown> | null }): Promise<void> };

export async function syncV4TerminalResult(input: { writer: V4TaskEventWriter; tenantId: string; sessionId: string; taskId: string; runId: string; items: V4TerminalItem[] }): Promise<{ status: "succeeded" | "partial_success" | "failed" | "cancelled" }> {
  const safeItems = input.items.slice(0, 24).map((item) => ({ itemId: item.itemId.slice(0, 200), status: item.status, ...(item.assetId ? { assetId: item.assetId.slice(0, 200) } : {}), ...(item.errorCode ? { errorCode: item.errorCode.slice(0, 200) } : {}) }));
  const succeeded = safeItems.filter((item) => item.status === "succeeded").length;
  const cancelled = safeItems.filter((item) => item.status === "cancelled").length;
  const status = succeeded === safeItems.length && safeItems.length > 0 ? "succeeded" : cancelled === safeItems.length && safeItems.length > 0 ? "cancelled" : succeeded > 0 ? "partial_success" : "failed";
  await input.writer.appendEvent({ tenantId: input.tenantId, sessionId: input.sessionId, taskId: input.taskId, agentNamespace: "canvas", agentVersion: "v4", eventType: "delivery_verified", eventJson: { taskId: input.taskId, runId: input.runId.slice(0, 200), status, items: safeItems }, idempotencyKey: `v4:${input.taskId}:delivery:${input.runId}` });
  await input.writer.updateTask({ tenantId: input.tenantId, status, outputJson: { generationItems: safeItems, workflowRunIds: [input.runId.slice(0, 200)] }, errorJson: status === "failed" ? { code: "AGENT_V4_GENERATION_FAILED" } : null });
  return { status };
}
