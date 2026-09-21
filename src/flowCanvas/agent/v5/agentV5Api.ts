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
  const phase = typeof record.phase === "string" && ["idle", "understanding", "waiting_for_input", "waiting_for_choice", "drafting_brief", "waiting_for_confirmation", "executing", "presenting_results", "refining", "failed", "recoverable_error"].includes(record.phase)
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
  const source = input.contextSnapshot ?? {};
  const refs = Array.isArray((source as Record<string, unknown>).refs) ? (source as Record<string, unknown>).refs : (input.referenceContext?.items ?? []).map((item) => ({ refId: item.refId, source: item.kind === "upload" ? "upload" : item.kind === "canvas_node" ? "canvas" : "asset", assetId: item.assetId, nodeId: item.nodeId, label: item.label }));
  const contextSnapshot = { projectId: typeof (source as Record<string, unknown>).projectId === "string" ? (source as Record<string, unknown>).projectId : input.snapshot.projectId, flowId: typeof (source as Record<string, unknown>).flowId === "string" ? (source as Record<string, unknown>).flowId : input.snapshot.flowId, graphRevision: typeof (source as Record<string, unknown>).graphRevision === "number" ? (source as Record<string, unknown>).graphRevision : 0, refs, skillIds: [], appIds: [], modelKey: input.modelKey ?? null };
  return apiPost<unknown>(`/agent/sessions/${encodeURIComponent(sessionId)}/turns`, { contextSnapshot, idempotencyKey: `turn-${Date.now()}`, prompt: input.prompt }).then(normalizeResponse);
}

export function submitAgentV5Decision(sessionId: string, turnId: string, decision: Record<string, unknown>) {
  const type = decision.type === "confirm" ? "approve_plan" : decision.type === "cancel" ? "cancel_execution" : decision.type === "select_choice" ? "answer_question" : decision.type === "update_brief" ? "edit_brief" : decision.type === "result_action" || decision.type === "refine" || typeof decision.action === "string" ? "result_action" : "revise_plan";
  const resultAction = decision.action === "place" || decision.action === "select" || decision.action === "reference" || decision.action === "variant" || decision.action === "edit" ? decision.action : "variant";
  const resultIds = Array.isArray(decision.resultIds) ? decision.resultIds.filter((value): value is string => typeof value === "string") : typeof decision.resultId === "string" ? [decision.resultId] : [];
  const payload = type === "approve_plan" || type === "cancel_execution" ? {} : type === "answer_question" ? { answers: { [String(decision.questionId ?? "answer")]: Array.isArray(decision.optionIds) ? decision.optionIds[0] : "" } } : type === "edit_brief" ? { instruction: `${String(decision.field ?? "")}: ${String(decision.value ?? "")}` } : type === "result_action" ? { action: resultAction, resultIds, ...(typeof decision.prompt === "string" ? { instruction: decision.prompt } : {}) } : { instruction: typeof decision.prompt === "string" ? decision.prompt : "修改计划" };
  return apiPost<unknown>(`/agent/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}/decisions`, { graphRevision: typeof decision.graphRevision === "number" ? decision.graphRevision : 0, idempotencyKey: typeof decision.idempotencyKey === "string" ? decision.idempotencyKey : `decision-${Date.now()}`, type, payload }).then(normalizeResponse);
}

export function getCanonicalAgentTurn(sessionId: string, turnId: string) {
  return apiGet<unknown>(`/agent/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}`).then(normalizeResponse);
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
