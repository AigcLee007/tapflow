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
