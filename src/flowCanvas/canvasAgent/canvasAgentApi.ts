import {
  V2HttpError,
  apiGet,
  apiPatch,
  apiPost,
  getStoredAccessToken,
  getStoredRefreshToken,
  refreshAccessToken,
} from "../../services/v2HttpClient";
import type {
  CanvasAgentAnswersPayload,
  CanvasAgentApprovalPayload,
  CanvasAgentEvent,
  CanvasAgentFile,
  CanvasAgentFileSummary,
  CanvasAgentGenerationResult,
  CanvasAgentImageModel,
  CanvasAgentMode,
  CanvasAgentSession,
  CanvasAgentStoredMessage,
  CanvasSnapshot,
} from "./canvasAgentTypes";

const BASE = "/canvas-agent";

/** Split an SSE buffer into complete events; returns the unfinished tail. */
export function drainSseBuffer(buffer: string, onEvent: (event: CanvasAgentEvent) => void): string {
  let rest = buffer.replace(/\r\n/g, "\n");
  let index = rest.indexOf("\n\n");
  while (index !== -1) {
    const frame = rest.slice(0, index);
    rest = rest.slice(index + 2);
    const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n");
    if (data) {
      try { onEvent(JSON.parse(data) as CanvasAgentEvent); } catch { /* skip a malformed frame */ }
    }
    index = rest.indexOf("\n\n");
  }
  return rest;
}

const bearer = (token: string | null): Record<string, string> =>
  (token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {});

/** POST that answers with Server-Sent Events. Resolves when the stream ends. */
async function streamPost(path: string, body: unknown, onEvent: (event: CanvasAgentEvent) => void, signal: AbortSignal): Promise<void> {
  const send = (token: string | null) => fetch(`/api/v2${path}`, {
    body: JSON.stringify(body),
    cache: "no-store",
    headers: { Accept: "text/event-stream", "Content-Type": "application/json", ...bearer(token) },
    method: "POST",
    signal,
  });
  let response = await send(getStoredAccessToken());
  if (response.status === 401 && getStoredRefreshToken()) response = await send((await refreshAccessToken()).accessToken);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string; requestId?: string } };
    throw new V2HttpError({
      code: payload.error?.code,
      message: payload.error?.message || `请求失败（${response.status}）`,
      requestId: payload.error?.requestId,
      status: response.status,
    });
  }
  if (!response.body) throw new V2HttpError({ message: "浏览器不支持流式响应", status: 0 });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer = drainSseBuffer(buffer + decoder.decode(value, { stream: true }), onEvent);
  }
  drainSseBuffer(`${buffer}${decoder.decode()}\n\n`, onEvent);
}

export const canvasAgentApi = {
  createSession: (flowId: string, mode: CanvasAgentMode) => apiPost<CanvasAgentSession>(`${BASE}/sessions`, { flowId, mode }),
  listSessions: (flowId: string) => apiGet<{ items: CanvasAgentSession[] }>(`${BASE}/sessions?flowId=${encodeURIComponent(flowId)}`).then((r) => r.items),
  getSession: (sessionId: string) => apiGet<{ messages: CanvasAgentStoredMessage[]; session: CanvasAgentSession }>(`${BASE}/sessions/${sessionId}`),
  updateSession: (sessionId: string, patch: { mode?: CanvasAgentMode; title?: string }) => apiPatch<CanvasAgentSession>(`${BASE}/sessions/${sessionId}`, patch),
  stop: (sessionId: string) => apiPost<{ stopped: boolean }>(`${BASE}/sessions/${sessionId}/stop`),
  listFiles: (flowId: string) => apiGet<{ items: CanvasAgentFileSummary[] }>(`${BASE}/flows/${flowId}/files`).then((r) => r.items),
  readFile: (flowId: string, path: string) => apiGet<CanvasAgentFile>(`${BASE}/flows/${flowId}/files/${encodeURIComponent(path)}`),
  listImageModels: () => apiGet<{ models: CanvasAgentImageModel[] }>(`${BASE}/image-models`).then((r) => r.models),

  sendMessage: (sessionId: string, input: { canvas: CanvasSnapshot | null; content: string }, onEvent: (event: CanvasAgentEvent) => void, signal: AbortSignal) =>
    streamPost(`${BASE}/sessions/${sessionId}/messages`, input, onEvent, signal),

  resume: (
    sessionId: string,
    input: { callId: string; canvas: CanvasSnapshot | null; payload: CanvasAgentAnswersPayload | CanvasAgentApprovalPayload | { results: CanvasAgentGenerationResult[] } },
    onEvent: (event: CanvasAgentEvent) => void,
    signal: AbortSignal,
  ) => streamPost(`${BASE}/sessions/${sessionId}/resume`, input, onEvent, signal),
};
