import { apiGet, apiPatch, apiPost } from "../../../../services/v2HttpClient";
import type { AgentExecutionMode, AgentV6Phase, ConfirmationPlan, ConversationState } from "../protocol/conversationTypes";

export type AgentV6Scope = {
  projectId: string | null;
  flowId: string | null;
  graphRevision: number;
};

export type AgentV6Session = {
  id: string;
  title: string;
  projectId: string | null;
  flowId: string | null;
  mode: AgentExecutionMode;
  updatedAt?: string;
};

export type AgentV6Response = {
  sessionId: string;
  turnId: string;
  projectId?: string | null;
  flowId?: string | null;
  phase: AgentV6Phase;
  executionState: ConversationState["executionState"];
  mode?: AgentExecutionMode;
  graphRevision: number;
  blocks?: unknown;
  contextSnapshot?: ConversationState["contextSnapshot"];
  plan?: ConfirmationPlan | null;
  pendingDecision?: ConversationState["pendingDecision"];
  progress?: ConversationState["progress"];
  results?: ConversationState["results"];
  prompt?: string | null;
  error?: string | null;
};

export type AgentV6History = {
  session: AgentV6Session;
  responses: AgentV6Response[];
};

export type AgentV6DurableEvent = {
  id: string;
  seq: number;
  eventType: string;
  eventJson: Record<string, unknown>;
};

export type AgentV6TurnInput = AgentV6Scope & {
  prompt: string;
  idempotencyKey: string;
};

export type AgentV6DecisionInput = AgentV6Scope & {
  type: string;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
  [key: string]: unknown;
};

export type AgentV6CancelInput = AgentV6Scope & {
  sessionId: string;
  turnId?: string;
  idempotencyKey: string;
  reason?: string;
};

export type AgentV6Api = {
  createSession(input: AgentV6Scope & { title?: string; mode?: AgentExecutionMode }): Promise<AgentV6Session>;
  listSessions(input: AgentV6Scope): Promise<AgentV6Session[]>;
  getSession(sessionId: string, input: AgentV6Scope): Promise<AgentV6Session>;
  getHistory(sessionId: string, input: AgentV6Scope): Promise<AgentV6History>;
  submitTurn(sessionId: string, input: AgentV6TurnInput): Promise<AgentV6Response>;
  submitDecision(sessionId: string, turnId: string, input: AgentV6DecisionInput): Promise<AgentV6Response>;
  confirmExecution(sessionId: string, turnId: string, input: AgentV6DecisionInput): Promise<AgentV6Response>;
  setMode(sessionId: string, input: AgentV6Scope & { mode: AgentExecutionMode }): Promise<AgentV6Session>;
  cancelTurn(sessionId: string, input: AgentV6CancelInput): Promise<AgentV6Response>;
};

const sessionPath = (sessionId: string) => `/agent/sessions/${encodeURIComponent(sessionId)}`;
const scopeQuery = (input: AgentV6Scope) => {
  const query = new URLSearchParams({ graphRevision: String(input.graphRevision) });
  if (input.projectId !== null) query.set("projectId", input.projectId);
  if (input.flowId !== null) query.set("flowId", input.flowId);
  return query.toString();
};

export const agentV6Api: AgentV6Api = {
  createSession: (input) => apiPost<AgentV6Session>("/agent/sessions", input),
  listSessions: (input) => apiGet<AgentV6Session[]>(`/agent/sessions?${scopeQuery(input)}`),
  getSession: (sessionId, input) => apiGet<AgentV6Session>(`${sessionPath(sessionId)}?${scopeQuery(input)}`),
  getHistory: (sessionId, input) => apiGet<AgentV6History>(`${sessionPath(sessionId)}/v6-history?${scopeQuery(input)}`),
  submitTurn: (sessionId, input) => apiPost<AgentV6Response>(`${sessionPath(sessionId)}/v6-turns`, input),
  submitDecision: (sessionId, turnId, input) => apiPost<AgentV6Response>(`${sessionPath(sessionId)}/v6-turns/${encodeURIComponent(turnId)}/decisions`, input),
  confirmExecution: (sessionId, turnId, input) => apiPost<AgentV6Response>(`${sessionPath(sessionId)}/v6-turns/${encodeURIComponent(turnId)}/confirm`, input),
  setMode: (sessionId, input) => apiPatch<AgentV6Session>(`${sessionPath(sessionId)}/v6-mode`, input),
  cancelTurn: (sessionId, input) => apiPost<AgentV6Response>(`${sessionPath(sessionId)}/v6-cancel`, input),
};
