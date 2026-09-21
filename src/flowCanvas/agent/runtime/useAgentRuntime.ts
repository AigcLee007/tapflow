import { useCallback, useEffect, useMemo, useState } from "react";

import { useFlowCanvasStore } from "../../store/flowCanvasStore";
import type { AgentReferenceContext } from "../agentReferenceContext";
import type { AgentContextSnapshot } from "./agentProtocol";
import { agentV6Api, type AgentV6Response, type AgentV6Scope } from "../v6/orchestration/agentV6Api";
import { applyResponse, createReplayState, restoreHistory, type ReplayState } from "../v6/replay/ReplayState";
import type { AgentExecutionMode, ConversationBlock, ResultRef } from "../v6/protocol/conversationTypes";

export type AgentRuntimeDecision =
  | { type: "answer_question"; answer: string; questionId?: string }
  | { type: "approve_plan" }
  | { type: "cancel_execution" }
  | { type: "retry_execution" }
  | { type: "revise_plan"; instruction: string }
  | { type: "result_action"; action: "place" | "select" | "reference" | "variant" | "edit"; resultIds: string[]; instruction?: string };

type SubmitTextOptions = { modelKey?: string | null; referenceContext?: AgentReferenceContext };

function buildTitle(prompt: string) {
  const value = prompt.replace(/\s+/g, " ").trim();
  return value.length > 36 ? `${value.slice(0, 36)}...` : value || "新对话";
}

function scopeFromCanvas(): AgentV6Scope {
  const canvas = useFlowCanvasStore.getState();
  return {
    projectId: canvas.backendProjectId ?? canvas.projectId ?? null,
    flowId: canvas.backendFlowId,
    graphRevision: canvas.version,
  };
}

function createIdempotencyKey(kind: string) {
  return `${kind}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function contextFromReferences(scope: AgentV6Scope, options: SubmitTextOptions): AgentContextSnapshot {
  const refs = (options.referenceContext?.items ?? []).flatMap((item) => {
    const source = item.kind === "canvas_node" ? "canvas" : item.kind === "upload" ? "upload" : "asset";
    if (!item.refId || !item.label) return [];
    return [{
      refId: item.refId,
      source,
      ...(item.nodeId ? { nodeId: item.nodeId } : {}),
      ...(item.assetId ? { assetId: item.assetId } : {}),
      label: item.label,
    }];
  });
  return { ...scope, refs, skillIds: [], appIds: [], modelKey: options.modelKey ?? null };
}

function responseState(current: ReplayState, response: AgentV6Response, scope: AgentV6Scope) {
  return applyResponse(current, response, scope);
}

export function useAgentRuntime() {
  const [state, setState] = useState<ReplayState>(() => createReplayState(scopeFromCanvas()));
  const [sessionTitle, setSessionTitle] = useState("新对话");

  const apply = useCallback((response: AgentV6Response, scope: AgentV6Scope) => {
    setState((current) => responseState(current, response, scope));
  }, []);

  const ensureSession = useCallback(async (prompt: string, scope: AgentV6Scope) => {
    if (state.sessionId) return state.sessionId;
    const created = await agentV6Api.createSession({ ...scope, title: buildTitle(prompt), mode: state.mode });
    if (created.mode !== state.mode) await agentV6Api.setMode(created.id, { ...scope, mode: state.mode });
    setSessionTitle(created.title);
    setState((current) => ({ ...current, sessionId: created.id, mode: created.mode }));
    return created.id;
  }, [state.mode, state.sessionId]);

  const submitText = useCallback(async (prompt: string, options: SubmitTextOptions = {}) => {
    const text = prompt.trim();
    if (!text) return;
    const scope = scopeFromCanvas();
    const sessionId = await ensureSession(text, scope);
    try {
      const response = await agentV6Api.submitTurn(sessionId, {
        ...scope,
        prompt: text,
        idempotencyKey: createIdempotencyKey("turn"),
        modelKey: options.modelKey ?? null,
        contextSnapshot: contextFromReferences(scope, options) as never,
      });
      apply(response, scope);
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : "Agent 暂时无法处理本次请求。", phase: "recoverable_error" }));
      throw error;
    }
  }, [apply, ensureSession]);

  const submitDecision = useCallback(async (decision: AgentRuntimeDecision) => {
    if (!state.sessionId || !state.turnId) return;
    const scope = scopeFromCanvas();
    const payload = decision.type === "answer_question"
      ? { answers: { [decision.questionId ?? "answer"]: decision.answer } }
      : decision.type === "result_action"
        ? { action: decision.action, resultIds: decision.resultIds, ...(decision.instruction ? { instruction: decision.instruction } : {}) }
        : decision.type === "revise_plan"
          ? { instruction: decision.instruction }
        : {};
    try {
      const response = await agentV6Api.submitDecision(state.sessionId, state.turnId, {
        ...scope,
        type: decision.type,
        payload,
        idempotencyKey: createIdempotencyKey("decision"),
      });
      apply(response, scope);
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : "Agent 决策提交失败。", phase: "recoverable_error" }));
      throw error;
    }
  }, [apply, state.sessionId, state.turnId]);

  const openSession = useCallback(async (sessionId: string) => {
    const scope = scopeFromCanvas();
    const history = await agentV6Api.getHistory(sessionId, scope);
    setSessionTitle(history.session.title);
    setState(restoreHistory(history, scope));
  }, []);

  const newConversation = useCallback(() => {
    setSessionTitle("新对话");
    setState(createReplayState(scopeFromCanvas()));
  }, []);

  const setExecutionMode = useCallback((mode: AgentExecutionMode) => {
    setState((current) => ({ ...current, mode }));
    if (state.sessionId) void agentV6Api.setMode(state.sessionId, { ...scopeFromCanvas(), mode }).catch(() => undefined);
  }, [state.sessionId]);

  useEffect(() => {
    if (!state.sessionId || !state.turnId || state.phase !== "executing") return;
    let disposed = false;
    const refresh = async () => {
      try {
        const scope = scopeFromCanvas();
        const latest = await agentV6Api.refreshTurn(state.sessionId!, state.turnId!, scope);
        if (!disposed) apply(latest, scope);
      } catch { /* transient worker/API delay; the next poll retries */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [apply, state.phase, state.sessionId, state.turnId]);

  return useMemo(() => ({
    blocks: state.blocks as ConversationBlock[],
    graphRevision: state.graphRevision,
    mode: state.mode,
    newConversation,
    openSession,
    phase: state.phase,
    results: state.results as ResultRef[],
    sessionId: state.sessionId ?? null,
    sessionTitle,
    setExecutionMode,
    submitDecision,
    submitText,
  }), [newConversation, openSession, sessionTitle, setExecutionMode, state, submitDecision, submitText]);
}
