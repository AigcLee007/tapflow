import { normalizeBlocks } from "../protocol/blockNormalizer";
import { initialConversationState, reduceConversation, type ConversationEvent } from "../protocol/conversationReducer";
import type { AgentDecision, AgentV6Phase, ConversationState, ProgressStep, ResultRef } from "../protocol/conversationTypes";
import type { AgentV6DurableEvent, AgentV6History, AgentV6Response, AgentV6Scope } from "../orchestration/agentV6Api";
import { normalizeStableId } from "../protocol/stableId";

export type ReplayState = ConversationState;
const phaseEvents: Record<AgentV6Phase, ConversationEvent["type"][]> = {
  idle: [], understanding: ["turn_submitted"], waiting_for_choice: ["turn_submitted", "choice_requested"], drafting_brief: ["turn_submitted", "brief_started"], waiting_for_confirmation: ["turn_submitted", "brief_started", "brief_ready"], executing: ["turn_submitted", "brief_started", "brief_ready", "confirmation_granted"], verifying: ["turn_submitted", "brief_started", "brief_ready", "confirmation_granted", "verification_started"], presenting_results: ["turn_submitted", "brief_started", "brief_ready", "confirmation_granted", "verification_started", "results_presented"], refining: ["turn_submitted", "brief_started", "brief_ready", "confirmation_granted", "verification_started", "results_presented", "refinement_requested"], failed: ["turn_submitted", "turn_failed"],
};
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const boundedText = (value: unknown, max = 4000) => typeof value === "string" ? value.slice(0, max) : "";
const safeId = (value: unknown) => normalizeStableId(value);
const safeNumber = (value: unknown, max = 1_000_000) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : undefined;

function choiceId(response: AgentV6Response) {
  const block = normalizeBlocks(response.blocks).find((item) => item.type === "choice_grid" || item.type === "question");
  return block && "id" in block ? block.id : undefined;
}
function eventFor(type: ConversationEvent["type"], response: AgentV6Response): ConversationEvent {
  if (type === "turn_submitted") return { type, prompt: boundedText(response.prompt), turnId: response.turnId };
  if (type === "choice_requested") return { type, id: choiceId(response) };
  if (type === "brief_ready") return { type, plan: response.plan ?? undefined, graphRevision: response.graphRevision, decisionId: safeId(response.pendingDecision?.decisionId) };
  if (type === "confirmation_granted") return { type, decisionId: safeId(response.pendingDecision?.decisionId) ?? "", graphRevision: response.graphRevision, plan: response.plan ?? undefined };
  if (type === "refinement_requested") return { type };
  if (type === "turn_failed") return { type, error: boundedText(response.error || "Agent 执行失败。") };
  return { type } as ConversationEvent;
}

function safeDecision(value: unknown): AgentDecision | null {
  const raw = asRecord(value);
  const type = raw.type;
  const decisionId = safeId(raw.decisionId); const sessionId = safeId(raw.sessionId); const turnId = safeId(raw.turnId); const idempotencyKey = safeId(raw.idempotencyKey);
  const graphRevision = safeNumber(raw.graphRevision, Number.MAX_SAFE_INTEGER);
  if (!decisionId || !sessionId || !turnId || !idempotencyKey || graphRevision === undefined) return null;
  const base = { decisionId, sessionId, turnId, graphRevision: Math.floor(graphRevision), payload: {}, idempotencyKey };
  if (type === "execute" || type === "confirm" || type === "cancel" || type === "select_choice" || type === "update_brief" || type === "refine") {
    const result: Record<string, unknown> = { ...base, type };
    if (type === "execute") {
      const costCredits = safeNumber(raw.costCredits); if (costCredits !== undefined) result.costCredits = costCredits;
      for (const key of ["batch", "writesCanvas", "skill", "app", "requiresConfirmation"]) if (typeof raw[key] === "boolean") result[key] = raw[key];
    }
    if (type === "cancel" && typeof raw.reason === "string") result.reason = boundedText(raw.reason, 500);
    if (type === "select_choice" && Array.isArray(raw.optionIds)) result.optionIds = raw.optionIds.flatMap(safeId).slice(0, 12);
    if (type === "update_brief" && typeof raw.field === "string" && typeof raw.value === "string") { result.field = boundedText(raw.field, 120); result.value = boundedText(raw.value); }
    if (type === "refine") { if (typeof raw.resultId === "string") result.resultId = safeId(raw.resultId); if (typeof raw.prompt === "string") result.prompt = boundedText(raw.prompt); }
    return result as AgentDecision;
  }
  return null;
}

function safeProgress(value: unknown): ProgressStep[] {
  const block = normalizeBlocks([{ type: "progress_card", steps: value }])[0];
  return block?.type === "progress_card" ? block.steps : [];
}
function safeResults(value: unknown): ResultRef[] {
  const block = normalizeBlocks([{ type: "result_group", results: value }])[0];
  return block?.type === "result_group" ? block.results : [];
}
function safePlan(value: unknown): ConversationState["plan"] {
  const raw = asRecord(value);
  const policy = asRecord(raw.serverPolicy);
  const policyHash = safeId(policy.policyHash);
  const costCredits = safeNumber(raw.costCredits);
  return {
    ...(typeof raw.title === "string" ? { title: boundedText(raw.title, 400) } : {}),
    ...(typeof raw.summary === "string" ? { summary: boundedText(raw.summary, 400) } : {}),
    ...(costCredits !== undefined ? { costCredits } : {}),
    ...(typeof policy.requiresConfirmation === "boolean" && policyHash ? { serverPolicy: { requiresConfirmation: policy.requiresConfirmation, policyHash } } : {}),
    ...(raw.batch === true ? { batch: true } : {}),
    ...(raw.writesCanvas === true ? { writesCanvas: true } : {}),
    ...(raw.skill === true ? { skill: true } : {}),
    ...(raw.app === true ? { app: true } : {}),
  };
}

function hasResponseScopeMismatch(state: ReplayState, response: AgentV6Response, scope: AgentV6Scope): boolean {
  if (state.replaySeq > 0 && state.sessionId && response.sessionId !== state.sessionId) return true;
  if (response.projectId !== undefined && response.projectId !== scope.projectId) return true;
  if (response.flowId !== undefined && response.flowId !== scope.flowId) return true;
  const snapshot = asRecord(response.contextSnapshot);
  if (snapshot.projectId !== undefined && snapshot.projectId !== scope.projectId) return true;
  if (snapshot.flowId !== undefined && snapshot.flowId !== scope.flowId) return true;
  const decision = asRecord(response.pendingDecision);
  if (decision.sessionId !== undefined && decision.sessionId !== response.sessionId) return true;
  return false;
}

export function createReplayState(scope: AgentV6Scope, seed?: string, mode?: ConversationState["mode"]): ReplayState {
  const state = initialConversationState({ mode, sessionId: undefined, contextSnapshot: { projectId: scope.projectId, flowId: scope.flowId, selectedNodeIds: [], assetRefs: [], uploadedAssetIds: [], skillRefs: [], appRefs: [], modelKey: null, graphRevision: scope.graphRevision }, graphRevision: scope.graphRevision }, seed ? { replaySeed: seed } : {});
  return { ...state, sessionId: undefined, turnId: undefined } as unknown as ReplayState;
}

export function applyResponse(state: ReplayState, response: AgentV6Response, scope: AgentV6Scope): ReplayState {
  if (hasResponseScopeMismatch(state, response, scope)) return { ...state, replayError: "resync-required" };
  if (response.graphRevision < state.graphRevision || response.graphRevision < scope.graphRevision) return state;
  const normalizedBlocks = normalizeBlocks(response.blocks);
  let next = initialConversationState({ mode: response.mode ?? state.mode, sessionId: response.sessionId, turnId: response.turnId, prompt: response.prompt ?? state.prompt, contextSnapshot: response.contextSnapshot ?? state.contextSnapshot, graphRevision: response.graphRevision }, { replaySeed: response.sessionId });
  for (const type of phaseEvents[response.phase] ?? []) next = reduceConversation(next, eventFor(type, response), { replaySeed: response.sessionId });
  const resultRefs = normalizedBlocks.flatMap((block) => block.type === "result_group" ? block.results : []);
  const progress = normalizedBlocks.flatMap((block) => block.type === "progress_card" ? block.steps : []);
  const contextSnapshot = next.contextSnapshot;
  const safePlanValue = response.plan === undefined ? next.plan : safePlan(response.plan);
  const safePendingDecision = response.pendingDecision === undefined ? next.pendingDecision : safeDecision(response.pendingDecision);
  return { ...next, sessionId: response.sessionId || next.sessionId, turnId: response.turnId || next.turnId, graphRevision: response.graphRevision, contextSnapshot, blocks: normalizedBlocks.length ? normalizedBlocks : next.blocks, progress: response.progress === undefined ? progress : safeProgress(response.progress), results: response.results === undefined ? resultRefs : safeResults(response.results), plan: safePlanValue, pendingDecision: safePendingDecision, prompt: response.prompt === undefined ? next.prompt : boundedText(response.prompt), error: response.error === undefined ? next.error : boundedText(response.error), executionState: response.executionState ?? next.executionState, replaySeq: state.replaySeq, replayCursor: state.replayCursor, replayError: null };
}

export function applyDurableEvent(state: ReplayState, event: AgentV6DurableEvent, scope: AgentV6Scope): ReplayState {
  if (!Number.isSafeInteger(event.seq) || event.seq <= state.replaySeq || event.seq !== state.replaySeq + 1) return state;
  const payload = asRecord(event.eventJson);
  const eventSessionId = safeId(event.sessionId) ?? safeId(payload.sessionId);
  const eventProjectId = event.projectId !== undefined ? event.projectId : (payload.projectId === null || typeof payload.projectId === "string" ? payload.projectId as string | null : undefined);
  const eventFlowId = event.flowId !== undefined ? event.flowId : (payload.flowId === null || typeof payload.flowId === "string" ? payload.flowId as string | null : undefined);
  if (eventSessionId && state.replaySeq > 0 && eventSessionId !== state.sessionId || eventProjectId !== undefined && eventProjectId !== scope.projectId || eventFlowId !== undefined && eventFlowId !== scope.flowId) return { ...state, replayError: "resync-required" };
  const response = asRecord(payload.response);
  const responseCandidate = (response.phase ? response : payload) as AgentV6Response;
  if ((eventSessionId && typeof responseCandidate.sessionId === "string" && responseCandidate.sessionId !== eventSessionId)
    || (eventProjectId !== undefined && responseCandidate.projectId !== undefined && responseCandidate.projectId !== eventProjectId)
    || (eventFlowId !== undefined && responseCandidate.flowId !== undefined && responseCandidate.flowId !== eventFlowId)) {
    return { ...state, replayError: "resync-required" };
  }
  if (!state.sessionId && event.sessionId && typeof responseCandidate.sessionId !== "string" && !payload.sessionId) {
    return { ...state, replayError: "resync-required" };
  }
  let next = state;
  if (event.eventType === "v6_response" || typeof response.phase === "string" || typeof payload.phase === "string") next = applyResponse(state, responseCandidate, scope);
  else {
    const type = payload.type;
    if (type === "turn_failed") next = reduceConversation(state, { type, error: boundedText(payload.error) });
    else if (type === "mode_changed" && (payload.mode === "auto" || payload.mode === "manual_confirmation")) next = reduceConversation(state, { type, mode: payload.mode });
    else if (type === "execution_started" || type === "verification_started" || type === "results_presented") next = reduceConversation(state, { type });
    const blocks = normalizeBlocks(payload.blocks); if (blocks.length) next = { ...next, blocks };
  }
  if (next === state) {
    return { ...state, sessionId: eventSessionId ?? state.sessionId, replaySeq: event.seq, replayCursor: safeId(event.id) ?? null, replayError: null };
  }
  return { ...next, replaySeq: event.seq, replayCursor: safeId(event.id) ?? null, replayError: null };
}

export function restoreHistory(history: AgentV6History, scope: AgentV6Scope): ReplayState {
  let state = createReplayState(scope, history.session.id, history.session.mode);
  for (const response of history.responses) state = applyResponse(state, response, scope);
  return { ...reduceConversation(state, { type: "mode_changed", mode: history.session.mode }), replaySeq: history.lastSeq, replayCursor: history.replayCursor, replayError: null };
}
