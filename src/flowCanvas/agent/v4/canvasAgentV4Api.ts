export async function createV4Turn(sessionId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/v2/agent/v4/sessions/${encodeURIComponent(sessionId)}/turns`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`AGENT_V4_HTTP_${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}
export function openV4EventStream(taskId: string, afterSeq = 0, onEvent?: (event: Record<string, unknown>) => void): EventSource {
  const source = new EventSource(`/api/v2/agent/v4/tasks/${encodeURIComponent(taskId)}/events?afterSeq=${afterSeq}`);
  source.addEventListener("event", (event) => { try { onEvent?.(JSON.parse((event as MessageEvent).data)); } catch { /* ignore malformed server event */ } });
  return source;
}
async function postV4(path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`AGENT_V4_HTTP_${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}
export const approveV4Task = (taskId: string) => postV4(`/api/v2/agent/v4/tasks/${encodeURIComponent(taskId)}/approve`, { approved: true });
export const cancelV4Task = (taskId: string) => postV4(`/api/v2/agent/v4/tasks/${encodeURIComponent(taskId)}/cancel`);
export const retryV4Item = (taskId: string, itemId: string) => postV4(`/api/v2/agent/v4/tasks/${encodeURIComponent(taskId)}/retry-item`, { itemId });
export const undoV4Task = (taskId: string, expectedRevision: number) => postV4(`/api/v2/agent/v4/tasks/${encodeURIComponent(taskId)}/undo`, { expectedRevision });
