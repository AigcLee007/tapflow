import { apiGet, apiPost, getStoredAccessToken } from "../../services/v2HttpClient";

import type { CanvasAgentPlannerOutput, CanvasAgentSnapshot } from "./canvasAgentTypes";

export type AgentSessionView = {
  createdAt: string;
  flowId: string | null;
  id: string;
  projectId: string | null;
  status?: string;
  title: string;
  updatedAt?: string;
};

export type CreateAgentTurnResponse = CanvasAgentPlannerOutput & {
  sessionId: string;
  turnId: string;
};

export function createAgentSession(input: {
  flowId: string | null;
  projectId: string | null;
  title?: string;
}) {
  return apiPost<AgentSessionView>("/agent/sessions", input);
}

export function getAgentSession(sessionId: string) {
  return apiGet<AgentSessionView>(`/agent/sessions/${sessionId}`);
}

export function createAgentTurn(sessionId: string, input: {
  prompt: string;
  snapshot: CanvasAgentSnapshot;
}) {
  return apiPost<CreateAgentTurnResponse>(`/agent/sessions/${sessionId}/turns`, input);
}

export async function openAgentTurnStream(sessionId: string, input: {
  prompt: string;
  snapshot: CanvasAgentSnapshot;
}) {
  const token = getStoredAccessToken();
  return fetch(`/api/v2/agent/sessions/${sessionId}/turns/stream`, {
    body: JSON.stringify(input),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {}),
    },
    method: "POST",
  });
}

export async function executeAgentTurnStream(sessionId: string, input: {
  prompt: string;
  snapshot: CanvasAgentSnapshot;
}) {
  const token = getStoredAccessToken();
  return fetch(`/api/v2/agent/sessions/${sessionId}/turns/execute/stream`, {
    body: JSON.stringify(input),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {}),
    },
    method: "POST",
  });
}

export async function approveAgentToolCallStream(sessionId: string, input: {
  toolCallKey: string;
  turnId: string;
}) {
  const token = getStoredAccessToken();
  return fetch(`/api/v2/agent/sessions/${sessionId}/tool-calls/approve/stream`, {
    body: JSON.stringify(input),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {}),
    },
    method: "POST",
  });
}

export async function readAgentSseStream(
  response: Response,
  handlers: {
    onDone?: (data: unknown) => void;
    onError?: (data: unknown) => void;
    onMessage?: (data: unknown) => void;
    onPlan?: (data: unknown) => void;
  },
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Agent stream response did not include a body.");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const event = chunk.match(/^event: (.+)$/m)?.[1];
      const dataLine = chunk.match(/^data: (.+)$/m)?.[1];
      const data = dataLine ? JSON.parse(dataLine) : null;
      if (event === "message") handlers.onMessage?.(data);
      if (event === "plan") handlers.onPlan?.(data);
      if (event === "done") handlers.onDone?.(data);
      if (event === "error") handlers.onError?.(data);
    }
  }
}
