import { apiPost, getStoredAccessToken, refreshAccessToken } from "../../../services/v2HttpClient";
import { readAgentSseStream } from "../canvasAgentApi";

export async function createV4Turn(sessionId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiPost<Record<string, unknown>>(`/agent/v4/sessions/${encodeURIComponent(sessionId)}/turns`, body);
}
export type V4EventStream = { close: () => void };

/** Fetch-based SSE keeps the V2 bearer token available (EventSource cannot set it). */
export function openV4EventStream(
  taskId: string,
  afterSeq = 0,
  onEvent?: (event: Record<string, unknown>) => void,
  onError?: () => void,
): V4EventStream {
  const controller = new AbortController();
  let closed = false;
  const consume = async (tokenOverride?: string) => {
    const token = tokenOverride ?? getStoredAccessToken();
    const query = new URLSearchParams({ afterSeq: String(afterSeq) });
    const response = await fetch(`/api/v2/agent/v4/tasks/${encodeURIComponent(taskId)}/events?${query}`, {
      cache: "no-store",
      headers: token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {},
      method: "GET",
      signal: controller.signal,
    });
    if (response.status === 401 && !closed) {
      const refreshed = await refreshAccessToken();
      return consume(refreshed.accessToken);
    }
    if (!response.ok) throw new Error(`Canvas Agent V4 stream failed with status ${response.status}`);
    await readAgentSseStream(response, {
      onEvent: (event) => {
        if (!closed && event && typeof event === "object" && !Array.isArray(event)) onEvent?.(event as Record<string, unknown>);
      },
    });
    if (!closed) onError?.();
  };
  void consume().catch((error) => {
    if (!closed && !(error instanceof DOMException && error.name === "AbortError")) onError?.();
  });
  return { close: () => { closed = true; controller.abort(); } };
}
async function postV4(path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiPost<Record<string, unknown>>(path.replace(/^\/api\/v2/, ""), body);
}
export const approveV4Task = (taskId: string) => postV4(`/api/v2/agent/v4/tasks/${encodeURIComponent(taskId)}/approve`, { approved: true });
export const cancelV4Task = (taskId: string) => postV4(`/api/v2/agent/v4/tasks/${encodeURIComponent(taskId)}/cancel`);
export const retryV4Item = (taskId: string, itemId: string) => postV4(`/api/v2/agent/v4/tasks/${encodeURIComponent(taskId)}/retry-item`, { itemId });
export const undoV4Task = (taskId: string, expectedRevision: number) => postV4(`/api/v2/agent/v4/tasks/${encodeURIComponent(taskId)}/undo`, { expectedRevision });
