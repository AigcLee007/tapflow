import { apiGet, apiPatch, apiPost, getStoredAccessToken } from "../../../services/v2HttpClient";
import { agentTurnResponseSchema, type AgentContextSnapshot, type AgentDecision, type AgentExecutionState, type AgentPhase, type AgentTurnResponse, type ConversationBlock } from "./agentProtocol";

export type AgentRuntimeSession = {
  id: string;
  title: string;
  projectId: string | null;
  flowId: string | null;
  mode: "auto" | "manual_confirmation";
  phase?: string;
  graphRevision?: number;
  updatedAt?: string;
};
export type AgentRuntimeHistory = { session: AgentRuntimeSession; turns: AgentTurnResponse[] };
export type AgentRuntimeEvent = { id: string; seq: number; eventType: string; event: Record<string, unknown>; replayCursor: string | null; stateVersion: number; sessionId: string; turnId: string | null };
export type AgentRuntimeEvents = { events: AgentRuntimeEvent[]; lastSeq: number; replayCursor: string | null };
export type CanonicalTurnInput = { prompt: string; idempotencyKey: string; contextSnapshot: AgentContextSnapshot };
export type CanonicalDecisionInput = Pick<AgentDecision, "blockId" | "type" | "idempotencyKey"> & { decisionId?: string; graphRevision?: number; payload: Record<string, unknown> };
export type AgentRuntimeApi = {
  createSession(input: { title?: string; projectId: string | null; flowId: string | null; mode?: "auto" | "manual_confirmation" }): Promise<AgentRuntimeSession>;
  listSessions(input?: { projectId?: string | null; flowId?: string | null }): Promise<AgentRuntimeSession[]>;
  getSession(sessionId: string): Promise<AgentRuntimeSession>;
  getHistory(sessionId: string): Promise<AgentRuntimeHistory>;
  listEvents(sessionId: string, input?: { afterSeq?: number; replayCursor?: string | null }): Promise<AgentRuntimeEvents>;
  streamEvents?(sessionId: string, input: { afterSeq?: number; replayCursor?: string | null; signal?: AbortSignal }, onEvent: (event: AgentRuntimeEvent) => void): Promise<void>;
  submitTurn(sessionId: string, input: CanonicalTurnInput): Promise<AgentTurnResponse>;
  submitDecision(sessionId: string, turnId: string, input: CanonicalDecisionInput): Promise<AgentTurnResponse>;
  setMode(sessionId: string, mode: "auto" | "manual_confirmation"): Promise<AgentRuntimeSession>;
  cancel(sessionId: string, input: { turnId: string; idempotencyKey: string; graphRevision?: number; reason?: string }): Promise<AgentTurnResponse>;
};

const path = (sessionId: string) => `/agent/sessions/${encodeURIComponent(sessionId)}`;
const query = (input: Record<string, string | number | null | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => { if (value !== undefined && value !== null) params.set(key, String(value)); });
  const value = params.toString();
  return value ? `?${value}` : "";
};
const asSession = (value: unknown): AgentRuntimeSession => {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    id: typeof source.id === "string" ? source.id : "",
    title: typeof source.title === "string" ? source.title : "新对话",
    projectId: typeof source.projectId === "string" ? source.projectId : null,
    flowId: typeof source.flowId === "string" ? source.flowId : null,
    mode: source.mode === "auto" || source.executionMode === "auto" ? "auto" : "manual_confirmation",
    ...(typeof source.phase === "string" ? { phase: source.phase } : {}),
    ...(typeof source.graphRevision === "number" ? { graphRevision: source.graphRevision } : {}),
    ...(typeof source.updatedAt === "string" ? { updatedAt: source.updatedAt } : {}),
  };
};
const asResponse = (value: unknown) => agentTurnResponseSchema.parse(value);

export const agentRuntimeApi: AgentRuntimeApi = {
  createSession: async (input) => asSession(await apiPost<unknown>("/agent/sessions", input)),
  listSessions: async (input = {}) => {
    const raw = await apiGet<unknown>(`/agent/sessions${query(input)}`);
    return Array.isArray(raw) ? raw.map(asSession) : [];
  },
  getSession: async (sessionId) => asSession(await apiGet<unknown>(path(sessionId))),
  getHistory: async (sessionId) => {
    const source = await apiGet<{ session?: unknown; turns?: unknown }>(`${path(sessionId)}/history`);
    return { session: asSession(source.session), turns: Array.isArray(source.turns) ? source.turns.map(asResponse) : [] };
  },
  listEvents: async (sessionId, input = {}) => {
    const source = await apiGet<AgentRuntimeEvents>(`${path(sessionId)}/events${query(input)}`);
    return { events: Array.isArray(source.events) ? source.events : [], lastSeq: source.lastSeq ?? 0, replayCursor: source.replayCursor ?? null };
  },
  streamEvents: async (sessionId, input, onEvent) => {
    const params = query({ afterSeq: input.afterSeq, replayCursor: input.replayCursor });
    const headers: Record<string, string> = { Accept: "text/event-stream", "Last-Event-ID": input.replayCursor ?? String(input.afterSeq ?? 0) };
    const token = getStoredAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`/api/v2${path(sessionId)}/events/stream${params}${params ? "&" : "?"}follow=true`, { headers, signal: input.signal });
    if (!response.ok || !response.body) throw new Error(`Agent event stream failed (${response.status})`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split("\\n\\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame.split("\\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
        const eventName = frame.split("\\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
        if (!data || eventName === "replay_complete") continue;
        try { const event = JSON.parse(data) as AgentRuntimeEvent; if (event && typeof event === "object") onEvent(event); } catch { /* ignore malformed forward-compatible frames */ }
      }
    }
  },
  submitTurn: async (sessionId, input) => asResponse(await apiPost<unknown>(`${path(sessionId)}/turns`, input)),
  submitDecision: async (sessionId, turnId, input) => asResponse(await apiPost<unknown>(`${path(sessionId)}/turns/${encodeURIComponent(turnId)}/decisions`, input)),
  setMode: async (sessionId, mode) => asSession(await apiPatch<unknown>(`${path(sessionId)}/mode`, { mode })),
  cancel: async (sessionId, input) => asResponse(await apiPost<unknown>(`${path(sessionId)}/cancel`, input)),
};

export type { AgentExecutionState, AgentPhase, ConversationBlock };
