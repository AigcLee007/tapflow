import { apiGet, apiPatch, apiPost } from "../../../../services/v2HttpClient";
import type { CanvasAgentSnapshot } from "../../canvasAgentTypes";
import type { AgentReferenceContext } from "../../agentReferenceContext";
import type { AgentDecision, AgentExecutionMode, AgentV6Phase, ConfirmationPlan, ConversationState } from "../protocol/conversationTypes";
import { normalizeBlocks } from "../protocol/blockNormalizer";
import { initialConversationState } from "../protocol/conversationReducer";
import { normalizeStableId } from "../protocol/stableId";

export type AgentV6Scope = { projectId: string | null; flowId: string | null; graphRevision: number };
export type AgentV6Session = { id: string; title: string; projectId: string | null; flowId: string | null; mode: AgentExecutionMode; updatedAt?: string };
export type AgentV6Response = {
  sessionId: string; turnId: string; projectId?: string | null; flowId?: string | null; phase: AgentV6Phase;
  executionState: ConversationState["executionState"]; mode?: AgentExecutionMode; graphRevision: number; blocks?: unknown;
  contextSnapshot?: ConversationState["contextSnapshot"]; plan?: ConfirmationPlan | null;
  pendingDecision?: ConversationState["pendingDecision"]; progress?: ConversationState["progress"]; results?: ConversationState["results"];
  prompt?: string | null; error?: string | null;
};
export type AgentV6History = { session: AgentV6Session; responses: AgentV6Response[]; lastSeq: number; replayCursor: string | null };
export type AgentV6DurableEvent = { id: string; seq: number; sessionId?: string; projectId?: string | null; flowId?: string | null; eventType: string; eventJson: Record<string, unknown> };
export type AgentV6EventsResponse = { events: AgentV6DurableEvent[]; lastSeq: number; replayCursor: string | null; resyncRequired?: boolean };
export type AgentV6TurnInput = AgentV6Scope & { prompt: string; idempotencyKey: string; mode?: AgentExecutionMode; modelKey?: string | null; contextSnapshot?: ConversationState["contextSnapshot"]; referenceContext?: AgentReferenceContext; snapshot?: CanvasAgentSnapshot };
export type AgentV6DecisionInput = AgentV6Scope & { type: string; payload?: Record<string, unknown>; idempotencyKey: string; [key: string]: unknown };
export type AgentV6CancelInput = AgentV6Scope & { sessionId: string; turnId: string; idempotencyKey: string; reason?: string };
export type AgentV6CancelResponse = { cancelled: boolean; turnId?: string; response?: AgentV6Response };

export type AgentV6Api = {
  createSession(input: AgentV6Scope & { title?: string; mode?: AgentExecutionMode }): Promise<AgentV6Session>;
  listSessions(input: AgentV6Scope): Promise<AgentV6Session[]>;
  getSession(sessionId: string, input: AgentV6Scope): Promise<AgentV6Session>;
  getHistory(sessionId: string, input: AgentV6Scope): Promise<AgentV6History>;
  listEvents(sessionId: string, input?: { projectId?: string | null; flowId?: string | null; afterSeq?: number }): Promise<AgentV6EventsResponse>;
  submitTurn(sessionId: string, input: AgentV6TurnInput): Promise<AgentV6Response>;
  submitDecision(sessionId: string, turnId: string, input: AgentV6DecisionInput): Promise<AgentV6Response>;
  confirmExecution(sessionId: string, turnId: string, input: AgentV6DecisionInput): Promise<AgentV6Response>;
  setMode(sessionId: string, input: AgentV6Scope & { mode: AgentExecutionMode }): Promise<AgentV6Session>;
  cancelTurn(sessionId: string, input: AgentV6CancelInput): Promise<AgentV6CancelResponse>;
};

const sessionPath = (sessionId: string) => `/agent/sessions/${encodeURIComponent(sessionId)}`;
const sessionQuery = (input: Pick<AgentV6Scope, "projectId" | "flowId">) => {
  const query = new URLSearchParams();
  if (input.projectId !== null) query.set("projectId", input.projectId);
  if (input.flowId !== null) query.set("flowId", input.flowId);
  return query.toString();
};
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const phaseSet = new Set<AgentV6Phase>(["idle", "understanding", "waiting_for_choice", "drafting_brief", "waiting_for_confirmation", "executing", "verifying", "presenting_results", "refining", "failed"]);
const executionSet = new Set<ConversationState["executionState"]>(["idle", "running", "verifying", "completed", "failed"]);

function defaultSnapshot(input: AgentV6TurnInput): CanvasAgentSnapshot {
  return { edges: [], flowId: input.flowId, nodeOutputs: {}, nodes: [], projectId: input.projectId, selectedNodeIds: [], viewport: { x: 0, y: 0, zoom: 1 } };
}
function defaultContext(input: AgentV6TurnInput) {
  return input.contextSnapshot ?? { projectId: input.projectId, flowId: input.flowId, selectedNodeIds: [], assetRefs: [], uploadedAssetIds: [], skillRefs: [], appRefs: [], modelKey: input.modelKey ?? null, graphRevision: input.graphRevision };
}
function safeDecision(value: unknown): Record<string, unknown> | null {
  const source = asRecord(value); const type = source.type;
  if (type === "confirm") return { type };
  if (type === "select_choice" && typeof source.blockId === "string" && typeof source.optionId === "string") return { type, blockId: source.blockId, optionId: source.optionId };
  if (type === "update_brief" && typeof source.field === "string" && typeof source.value === "string") return { type, field: source.field, value: source.value };
  if (type === "cancel") return { type, ...(typeof source.reason === "string" ? { reason: source.reason } : {}) };
  if (type === "refine") return { type, ...(typeof source.resultId === "string" ? { resultId: source.resultId } : {}), ...(typeof source.prompt === "string" ? { prompt: source.prompt } : {}) };
  return null;
}
function safePendingDecision(value: unknown): ConversationState["pendingDecision"] {
  const source = asRecord(value);
  if (source.type !== "execute") return null;
  const decisionId = normalizeStableId(source.decisionId);
  const sessionId = normalizeStableId(source.sessionId);
  const turnId = normalizeStableId(source.turnId);
  const idempotencyKey = normalizeStableId(source.idempotencyKey);
  const graphRevision = typeof source.graphRevision === "number" && Number.isSafeInteger(source.graphRevision) && source.graphRevision >= 0 ? source.graphRevision : null;
  if (!decisionId || !sessionId || !turnId || !idempotencyKey || graphRevision === null) return null;
  const sensitiveKeys = new Set(["provider", "route", "credential", "credentialid", "apikey", "baseurl", "signedurl", "authorization", "token", "secret", "password", "nonce", "authtag", "data", "blob", "html", "base64"]);
  const sensitiveString = (input: string) => /^(?:data:|blob:)/i.test(input) || /\b(?:bearer|basic)\s+\S+/i.test(input) || /^ey[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+$/i.test(input) || /^(?:sk-|rk-|gh[pousr]_|xox[baprs]-|AIza)/i.test(input);
  const sanitize = (input: unknown, depth = 0): unknown => {
    if (depth > 6) return null;
    if (input === null || typeof input === "boolean") return input;
    if (typeof input === "number") return Number.isFinite(input) ? input : null;
    if (typeof input === "string") return sensitiveString(input) ? null : input.slice(0, 4000);
    if (Array.isArray(input)) return input.slice(0, 12).map((item) => sanitize(item, depth + 1)).filter((item) => item !== null);
    const record = asRecord(input);
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record).slice(0, 32)) {
      if (sensitiveKeys.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""))) continue;
      const safe = sanitize(item, depth + 1);
      if (safe !== null) result[key] = safe;
    }
    return result;
  };
  const payload = sanitize(source.payload);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const result: AgentDecision = { type: "execute", decisionId, sessionId, turnId, graphRevision, payload: payload as Record<string, unknown>, idempotencyKey };
  if (typeof source.costCredits === "number" && Number.isFinite(source.costCredits) && source.costCredits >= 0) result.costCredits = source.costCredits;
  for (const key of ["batch", "writesCanvas", "skill", "app", "requiresConfirmation"] as const) if (typeof source[key] === "boolean") result[key] = source[key];
  return result;
}
function normalizeResponse(value: unknown, fallback: AgentV6Scope & { sessionId?: string; turnId?: string }): AgentV6Response {
  const source = asRecord(value);
  const phase = phaseSet.has(source.phase as AgentV6Phase) ? source.phase as AgentV6Phase : "understanding";
  const executionState = executionSet.has(source.executionState as ConversationState["executionState"]) ? source.executionState as ConversationState["executionState"] : "idle";
  const graphRevision = typeof source.graphRevision === "number" && Number.isSafeInteger(source.graphRevision) && source.graphRevision >= 0 ? source.graphRevision : fallback.graphRevision;
  const safeState = initialConversationState({
    contextSnapshot: asRecord(source.contextSnapshot) as never,
    graphRevision,
    plan: asRecord(source.plan) as never,
  });
  const blocks = normalizeBlocks(source.blocks ?? source.conversationBlocks ?? source.message);
  const progressBlock = normalizeBlocks([{ type: "progress_card", steps: source.progress }])[0];
  const resultBlock = normalizeBlocks([{ type: "result_group", results: source.results }])[0];
  return { sessionId: normalizeStableId(source.sessionId) ?? fallback.sessionId ?? "", turnId: normalizeStableId(source.turnId) ?? fallback.turnId ?? "", phase, executionState, graphRevision, blocks, ...(source.projectId === null || typeof source.projectId === "string" ? { projectId: source.projectId as string | null } : {}), ...(source.flowId === null || typeof source.flowId === "string" ? { flowId: source.flowId as string | null } : {}), ...(source.mode === "auto" || source.mode === "manual_confirmation" ? { mode: source.mode } : {}), ...(source.contextSnapshot && typeof source.contextSnapshot === "object" ? { contextSnapshot: safeState.contextSnapshot } : {}), ...(source.plan && typeof source.plan === "object" ? { plan: safeState.plan } : {}), ...(source.pendingDecision !== undefined ? { pendingDecision: safePendingDecision(source.pendingDecision) } : {}), ...(progressBlock?.type === "progress_card" ? { progress: progressBlock.steps } : {}), ...(resultBlock?.type === "result_group" ? { results: resultBlock.results } : {}), ...(typeof source.prompt === "string" ? { prompt: source.prompt.slice(0, 4000) } : {}), ...(typeof source.error === "string" ? { error: source.error.slice(0, 4000) } : {}) };
}
function normalizeCursor(value: unknown): string | null { return normalizeStableId(value) ?? null; }
function normalizeDurableEvent(value: unknown): AgentV6DurableEvent | null {
  const source = asRecord(value);
  const id = normalizeStableId(source.id);
  const seq = typeof source.seq === "number" && Number.isSafeInteger(source.seq) && source.seq >= 0 ? source.seq : null;
  if (!id || seq === null || typeof source.eventType !== "string") return null;
  const sessionId = normalizeStableId(source.sessionId);
  return {
    id,
    seq,
    ...(sessionId ? { sessionId } : {}),
    ...(source.projectId === null || typeof source.projectId === "string" ? { projectId: source.projectId as string | null } : {}),
    ...(source.flowId === null || typeof source.flowId === "string" ? { flowId: source.flowId as string | null } : {}),
    eventType: source.eventType.slice(0, 120),
    eventJson: asRecord(source.eventJson),
  };
}
function normalizeSession(value: unknown): AgentV6Session {
  const source = asRecord(value);
  return {
    id: normalizeStableId(source.id) ?? "",
    title: typeof source.title === "string" ? source.title.slice(0, 120) : "新对话",
    projectId: source.projectId === null || typeof source.projectId === "string" ? source.projectId as string | null : null,
    flowId: source.flowId === null || typeof source.flowId === "string" ? source.flowId as string | null : null,
    mode: source.mode === "auto" || source.executionMode === "auto" ? "auto" : "manual_confirmation",
    ...(typeof source.updatedAt === "string" ? { updatedAt: source.updatedAt } : {}),
  };
}
function toHistoryResponse(turn: Record<string, unknown>, session: AgentV6Session): AgentV6Response {
  return normalizeResponse({ sessionId: session.id, projectId: session.projectId, flowId: session.flowId, turnId: turn.id, phase: turn.phase ?? turn.conversationPhase, executionState: turn.executionState, mode: session.mode, graphRevision: turn.graphRevision, blocks: turn.blocks ?? turn.blocksJson, plan: turn.plan ?? turn.planJson, error: asRecord(turn.errorJson).message }, { ...session, sessionId: session.id, turnId: typeof turn.id === "string" ? turn.id : undefined, graphRevision: typeof turn.graphRevision === "number" ? turn.graphRevision : 0 });
}

export const agentV6Api: AgentV6Api = {
  createSession: async (input) => normalizeSession(await apiPost<unknown>("/agent/sessions", { ...(input.title ? { title: input.title } : {}), projectId: input.projectId, flowId: input.flowId, mode: input.mode ?? "manual_confirmation" })),
  listSessions: async (input) => { const query = sessionQuery(input); const raw = await apiGet<unknown>(`/agent/sessions${query ? `?${query}` : ""}`); return Array.isArray(raw) ? raw.map(normalizeSession) : []; },
  getSession: async (sessionId, input) => { const query = sessionQuery(input); return normalizeSession(await apiGet<unknown>(`${sessionPath(sessionId)}${query ? `?${query}` : ""}`)); },
  getHistory: async (sessionId, input) => { const query = sessionQuery(input); const source = asRecord(await apiGet<unknown>(`${sessionPath(sessionId)}/history${query ? `?${query}` : ""}`)); const session = normalizeSession(source.session); const turns = Array.isArray(source.turns) ? source.turns : []; return { session, responses: turns.map((turn) => toHistoryResponse(asRecord(turn), session)), lastSeq: typeof source.lastSeq === "number" ? source.lastSeq : 0, replayCursor: normalizeCursor(source.replayCursor) }; },
  listEvents: async (sessionId, input) => { const query = new URLSearchParams(); if (input?.projectId) query.set("projectId", input.projectId); if (input?.flowId) query.set("flowId", input.flowId); if (input?.afterSeq !== undefined) query.set("afterSeq", String(Math.max(0, Math.floor(input.afterSeq)))); const suffix = query.toString(); const raw = await apiGet<AgentV6EventsResponse>(`${sessionPath(sessionId)}/events${suffix ? `?${suffix}` : ""}`); return { events: Array.isArray(raw.events) ? raw.events.flatMap((event) => { const normalized = normalizeDurableEvent(event); return normalized ? [normalized] : []; }) : [], lastSeq: typeof raw.lastSeq === "number" ? raw.lastSeq : 0, replayCursor: normalizeCursor(raw.replayCursor), ...(raw.resyncRequired ? { resyncRequired: true } : {}) }; },
  submitTurn: async (sessionId, input) => normalizeResponse(await apiPost<unknown>(`${sessionPath(sessionId)}/v5-turns`, { contextSnapshot: defaultContext(input), idempotencyKey: input.idempotencyKey, mode: input.mode ?? "manual_confirmation", modelKey: input.modelKey ?? null, prompt: input.prompt, referenceContext: input.referenceContext ?? { items: [] }, snapshot: input.snapshot ?? defaultSnapshot(input) }), input),
  submitDecision: async (sessionId, turnId, input) => { const decision = safeDecision(input.payload ?? input); if (!decision) throw new Error("AGENT_V6_UNSAFE_DECISION"); return normalizeResponse(await apiPost<unknown>(`${sessionPath(sessionId)}/v5-turns/${encodeURIComponent(turnId)}/decisions`, { projectId: input.projectId, flowId: input.flowId, graphRevision: input.graphRevision, decision }), input); },
  confirmExecution: (sessionId, turnId, input) => agentV6Api.submitDecision(sessionId, turnId, { ...input, type: "confirm", payload: { type: "confirm" } }),
  setMode: async (sessionId, input) => normalizeSession(await apiPatch<unknown>(`${sessionPath(sessionId)}/v5-mode`, { projectId: input.projectId, flowId: input.flowId, graphRevision: input.graphRevision, mode: input.mode })),
  cancelTurn: (sessionId, input) => apiPost<AgentV6CancelResponse>(`${sessionPath(sessionId)}/cancel`, { turnId: input.turnId, projectId: input.projectId, flowId: input.flowId, graphRevision: input.graphRevision, idempotencyKey: input.idempotencyKey, ...(input.reason ? { reason: input.reason } : {}) }),
};
