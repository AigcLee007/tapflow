import { apiGet, apiPatch, apiPost } from "../../../services/v2HttpClient";
import type { AgentReferenceContext } from "../agentReferenceContext";
import type { CanvasAgentSnapshot } from "../canvasAgentTypes";
import type { AgentExecutionMode, AgentV5Phase, ConversationBlock } from "./agentV5Types";
import { normalizeAgentV5Blocks } from "./agentV5Blocks";

export type AgentV5TurnResponse = {
  blocks: ConversationBlock[];
  executionState?: string;
  phase: AgentV5Phase;
  sessionId: string;
  turnId: string;
};

export type AgentV5TurnInput = {
  contextSnapshot?: Record<string, unknown>;
  mode?: AgentExecutionMode;
  modelKey?: string | null;
  prompt: string;
  referenceContext?: AgentReferenceContext;
  snapshot: CanvasAgentSnapshot;
};

function normalizeResponse(value: unknown): AgentV5TurnResponse {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const phase = typeof record.phase === "string" && ["idle", "understanding", "waiting_for_choice", "drafting_brief", "waiting_for_confirmation", "executing", "presenting_results", "refining", "failed"].includes(record.phase)
    ? record.phase as AgentV5Phase
    : "understanding";
  return {
    blocks: normalizeAgentV5Blocks(record.blocks ?? record.conversationBlocks ?? record.message),
    executionState: typeof record.executionState === "string" ? record.executionState : undefined,
    phase,
    sessionId: typeof record.sessionId === "string" ? record.sessionId : "",
    turnId: typeof record.turnId === "string" ? record.turnId : "",
  };
}

export function submitAgentV5Turn(sessionId: string, input: AgentV5TurnInput) {
  return apiPost<unknown>(`/agent/sessions/${encodeURIComponent(sessionId)}/v5-turns`, input).then(normalizeResponse);
}

export function submitAgentV5Decision(sessionId: string, turnId: string, decision: Record<string, unknown>) {
  return apiPost<unknown>(`/agent/sessions/${encodeURIComponent(sessionId)}/v5-turns/${encodeURIComponent(turnId)}/decisions`, { decision }).then(normalizeResponse);
}

export function updateAgentV5Mode(sessionId: string, mode: AgentExecutionMode) {
  return apiPatch<{ executionMode: AgentExecutionMode }>(`/agent/sessions/${encodeURIComponent(sessionId)}/v5-mode`, { mode });
}

export function listAgentV5Sessions(input?: { flowId?: string | null; projectId?: string | null }) {
  const query = new URLSearchParams();
  if (input?.flowId) query.set("flowId", input.flowId);
  if (input?.projectId) query.set("projectId", input.projectId);
  return apiGet<Array<{ id: string; title: string; updatedAt?: string }>>(`/agent/sessions${query.toString() ? `?${query.toString()}` : ""}`);
}
