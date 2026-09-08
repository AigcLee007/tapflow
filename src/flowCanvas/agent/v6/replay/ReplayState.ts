import { normalizeBlocks } from "../protocol/blockNormalizer";
import { initialConversationState, reduceConversation, type ConversationEvent } from "../protocol/conversationReducer";
import type { AgentV6Phase, ConversationState } from "../protocol/conversationTypes";
import type { AgentV6DurableEvent, AgentV6History, AgentV6Response, AgentV6Scope } from "../orchestration/agentV6Api";

export type ReplayState = ConversationState;

const phaseEvents: Record<AgentV6Phase, ConversationEvent["type"][]> = {
  idle: [], understanding: ["turn_submitted"], waiting_for_choice: ["turn_submitted", "choice_requested"], drafting_brief: ["turn_submitted", "brief_started"], waiting_for_confirmation: ["turn_submitted", "brief_started", "brief_ready"], executing: ["turn_submitted", "brief_started", "brief_ready", "confirmation_granted"], verifying: ["turn_submitted", "brief_started", "brief_ready", "confirmation_granted", "verification_started"], presenting_results: ["turn_submitted", "brief_started", "brief_ready", "confirmation_granted", "verification_started", "results_presented"], refining: ["turn_submitted", "brief_started", "brief_ready", "confirmation_granted", "verification_started", "results_presented", "refinement_requested"], failed: ["turn_submitted", "turn_failed"],
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function choiceId(response: AgentV6Response) {
  const block = normalizeBlocks(response.blocks).find((item) => item.type === "choice_grid" || item.type === "question");
  return block && "id" in block ? block.id : undefined;
}

function eventFor(type: ConversationEvent["type"], response: AgentV6Response): ConversationEvent {
  if (type === "turn_submitted") return { type, prompt: response.prompt ?? "", turnId: response.turnId };
  if (type === "choice_requested") return { type, id: choiceId(response) };
  if (type === "brief_ready") return { type, plan: response.plan ?? undefined, graphRevision: response.graphRevision, decisionId: response.pendingDecision?.decisionId };
  if (type === "confirmation_granted") return { type, decisionId: response.pendingDecision?.decisionId ?? "", graphRevision: response.graphRevision, plan: response.plan ?? undefined };
  if (type === "refinement_requested") return { type };
  if (type === "turn_failed") return { type, error: response.error ?? "Agent 执行失败。" };
  return { type } as ConversationEvent;
}

export function createReplayState(scope: AgentV6Scope, seed?: string, mode?: ConversationState["mode"]): ReplayState {
  return initialConversationState({ mode, sessionId: undefined, contextSnapshot: { projectId: scope.projectId, flowId: scope.flowId, selectedNodeIds: [], assetRefs: [], uploadedAssetIds: [], skillRefs: [], appRefs: [], modelKey: null, graphRevision: scope.graphRevision }, graphRevision: scope.graphRevision }, seed ? { replaySeed: seed } : {});
}

export function applyResponse(state: ReplayState, response: AgentV6Response, scope: AgentV6Scope): ReplayState {
  if (response.projectId !== undefined && response.projectId !== scope.projectId) return state;
  if (response.flowId !== undefined && response.flowId !== scope.flowId) return state;
  if (response.graphRevision < state.graphRevision || response.graphRevision < scope.graphRevision) return state;
  const normalizedBlocks = normalizeBlocks(response.blocks);
  let next = initialConversationState({
    mode: response.mode ?? state.mode,
    sessionId: response.sessionId,
    turnId: response.turnId,
    prompt: response.prompt ?? state.prompt,
    contextSnapshot: response.contextSnapshot ?? state.contextSnapshot,
    graphRevision: response.graphRevision,
  }, { replaySeed: response.sessionId });
  const events = phaseEvents[response.phase] ?? [];
  for (const type of events) {
    next = reduceConversation(next, eventFor(type, response), { replaySeed: response.sessionId });
  }
  const resultRefs = normalizedBlocks.flatMap((block) => block.type === "result_group" ? block.results : []);
  const progress = normalizedBlocks.flatMap((block) => block.type === "progress_card" ? block.steps : []);
  const contextSnapshot = response.contextSnapshot ? { ...next.contextSnapshot, ...response.contextSnapshot, graphRevision: response.graphRevision } : { ...next.contextSnapshot, graphRevision: response.graphRevision };
  return { ...next, sessionId: response.sessionId || next.sessionId, turnId: response.turnId || next.turnId, graphRevision: response.graphRevision, contextSnapshot, blocks: normalizedBlocks.length ? normalizedBlocks : next.blocks, progress: response.progress ?? progress, results: response.results ?? resultRefs, plan: response.plan === undefined ? next.plan : response.plan, pendingDecision: response.pendingDecision === undefined ? next.pendingDecision : response.pendingDecision, prompt: response.prompt === undefined ? next.prompt : response.prompt, error: response.error === undefined ? next.error : response.error, executionState: response.executionState ?? next.executionState };
}

export function applyDurableEvent(state: ReplayState, event: AgentV6DurableEvent, scope: AgentV6Scope): ReplayState {
  const payload = record(event.eventJson);
  const response = (payload.response ?? payload) as AgentV6Response;
  if (event.eventType === "v6_response" || typeof response.phase === "string") return applyResponse(state, response, scope);
  const normalized = normalizeBlocks(payload.blocks);
  const next = reduceConversation(state, payload as ConversationEvent, { replaySeed: event.id });
  return normalized.length ? { ...next, blocks: normalized } : next;
}

export function restoreHistory(history: AgentV6History, scope: AgentV6Scope): ReplayState {
  let state = createReplayState(scope, history.session.id, history.session.mode);
  for (const response of history.responses) state = applyResponse(state, response, scope);
  return reduceConversation(state, { type: "mode_changed", mode: history.session.mode });
}
