import { apiGet, apiPost, getStoredAccessToken } from "../../services/v2HttpClient";

import type { CanvasAgentPlannerOutput, CanvasAgentSnapshot } from "./canvasAgentTypes";
import type { AgentImageRunSettingsResponse, AgentImageRunSettingsSelection } from "./agentRunSettings";
import type { AgentReferenceContext } from "./agentReferenceContext";
import type { CanvasAgentContinuationAction } from "./canvasAgentToolTypes";

export type AgentSessionView = {
  createdAt: string;
  flowId: string | null;
  id: string;
  projectId: string | null;
  status?: string;
  title: string;
  updatedAt?: string;
};

export type AgentHistoryMessage = {
  content: string;
  createdAt: string;
  id: string;
  metadata?: Record<string, unknown>;
  role: "assistant" | "system" | "user";
  sessionId: string;
};

export type AgentHistoryTurn = {
  createdAt: string;
  errorJson?: unknown;
  id: string;
  planJson?: unknown;
  sessionId: string;
  snapshotJson?: unknown;
  status: string;
  updatedAt: string;
};

export type AgentSessionHistoryResponse = {
  messages: AgentHistoryMessage[];
  session: AgentSessionView;
  turns: AgentHistoryTurn[];
};

export type AgentSessionEvent = {
  createdAt: string;
  eventJson: Record<string, unknown>;
  eventType: string;
  id: string;
  seq: number;
  sessionId: string;
  taskId: string | null;
  turnId: string | null;
};

export type AgentSessionEventsResponse = {
  events: AgentSessionEvent[];
};

export type CreateAgentTurnResponse = CanvasAgentPlannerOutput & {
  sessionId: string;
  turnId: string;
};

export type AgentImageRunSettingsEstimateResponse = {
  estimatedCredits: number;
  routeKey: string;
  size: "1K" | "2K" | "4K";
};

export type AgentSkillPreview = {
  id: string;
  modality: "text" | "image" | "video";
  name: string;
  ownerUserId: string | null;
  status: string;
  summary: string;
  version: number;
  visibility: "official" | "private";
};

export type AgentContinuationContext = {
  action: CanvasAgentContinuationAction;
  assetId: string;
  assetIds?: string[];
  assetLabel: string;
  assetLabels?: string[];
  assetRefId: string;
  assetRefIds?: string[];
};

export type AgentTurnRequestInput = {
  continuationContext?: AgentContinuationContext | null;
  prompt: string;
  referenceContext?: AgentReferenceContext;
  snapshot: CanvasAgentSnapshot;
};

export type AgentCanvasApplyResponse = {
  applied: {
    createdNodeIds: string[];
    edgeIds: string[];
    runNodeIds: string[];
    updatedNodeIds: string[];
  };
  draft: {
    createdAt: string;
    flowId: string;
    graph: {
      edges: Record<string, unknown>[];
      nodes: Record<string, unknown>[];
      viewport: {
        x: number;
        y: number;
        zoom: number;
      };
    };
    id: string;
    lastSavedBy: string | null;
    projectId: string;
    revision: number;
    tenantId: string;
    updatedAt: string;
  };
  event: AgentSessionEvent | null;
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

export function listAgentSessions(input?: {
  flowId?: string | null;
  limit?: number;
  projectId?: string | null;
}) {
  const query = new URLSearchParams();
  if (input?.projectId !== undefined) query.set("projectId", input.projectId ?? "");
  if (input?.flowId !== undefined) query.set("flowId", input.flowId ?? "");
  if (input?.limit !== undefined) query.set("limit", String(input.limit));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiGet<AgentSessionView[]>(`/agent/sessions${suffix}`);
}

export function getAgentSessionHistory(sessionId: string) {
  return apiGet<AgentSessionHistoryResponse>(`/agent/sessions/${sessionId}/history`);
}

export function getAgentSessionEvents(sessionId: string, input?: { afterSeq?: number }) {
  const query = new URLSearchParams();
  if (input?.afterSeq !== undefined) query.set("afterSeq", String(input.afterSeq));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiGet<AgentSessionEventsResponse>(`/agent/sessions/${sessionId}/events${suffix}`);
}

export function createAgentMessage(sessionId: string, input: {
  content: string;
  metadata?: Record<string, unknown>;
}) {
  return apiPost<AgentHistoryMessage>(`/agent/sessions/${sessionId}/messages`, input);
}

export function createAgentTurn(sessionId: string, input: AgentTurnRequestInput) {
  return apiPost<CreateAgentTurnResponse>(`/agent/sessions/${sessionId}/turns`, input);
}

export function listAgentSkills(input?: { modality?: AgentSkillPreview["modality"]; q?: string; scope?: "available" | "mine" }) {
  const query = new URLSearchParams({ scope: input?.scope ?? "available" });
  if (input?.modality) query.set("modality", input.modality);
  if (input?.q) query.set("q", input.q);
  return apiGet<AgentSkillPreview[]>(`/agent/skills?${query.toString()}`);
}

export function getAgentSkill(skillId: string) {
  return apiGet<{ id: string; ownerUserId: string; revision: number; source: Record<string, unknown> }>(`/agent/skills/${skillId}`);
}

export function authorAgentSkillTurn(input: { draft: Record<string, unknown>; userMessage: string }) {
  return apiPost<Record<string, unknown>>("/agent/skills/authoring/turn", input);
}

export async function openAgentV2TurnStream(sessionId: string, input: AgentTurnRequestInput & { idempotencyKey?: string; routeKey?: string }) {
  const token = getStoredAccessToken();
  return fetch(`/api/v2/agent/sessions/${sessionId}/v2-turns/stream`, {
    body: JSON.stringify(input),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {}),
    },
    method: "POST",
  });
}

export function applyAgentCanvasOps(
  sessionId: string,
  input: {
    expectedRevision?: number;
    flowId: string;
    ops: CanvasAgentPlannerOutput["proposedOps"];
    turnId: string;
  },
) {
  return apiPost<AgentCanvasApplyResponse>(`/agent/sessions/${sessionId}/canvas-ops`, input);
}

export function getAgentImageRunSettings() {
  return apiGet<AgentImageRunSettingsResponse>("/agent/run-settings/image");
}

export function estimateAgentImageRunSettings(input: {
  routeKey: string;
  size: "1K" | "2K" | "4K";
}) {
  const query = new URLSearchParams({
    routeKey: input.routeKey,
    size: input.size,
  });
  return apiGet<AgentImageRunSettingsEstimateResponse>(`/agent/run-settings/image/estimate?${query.toString()}`);
}

export async function openAgentTurnStream(sessionId: string, input: AgentTurnRequestInput) {
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

export async function executeAgentTurnStream(sessionId: string, input: AgentTurnRequestInput) {
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
  settings?: AgentImageRunSettingsSelection;
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

export async function openAgentSessionEventStream(sessionId: string, input?: { afterSeq?: number }) {
  const token = getStoredAccessToken();
  const query = new URLSearchParams();
  if (input?.afterSeq !== undefined) query.set("afterSeq", String(input.afterSeq));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return fetch(`/api/v2/agent/sessions/${sessionId}/events/stream${suffix}`, {
    cache: "no-store",
    headers: {
      ...(token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {}),
    },
    method: "GET",
  });
}

export async function readAgentSseStream(
  response: Response,
  handlers: {
    onEvent?: (data: unknown) => void;
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
      if (event === "event") handlers.onEvent?.(data);
      if (event === "plan") handlers.onPlan?.(data);
      if (event === "done") handlers.onDone?.(data);
      if (event === "error") handlers.onError?.(data);
    }
  }
}
