import { useCallback, useEffect, useMemo, useState } from "react";

import { useFlowCanvasStore } from "../../store/flowCanvasStore";
import type { AgentReferenceContext } from "../agentReferenceContext";
import type { AgentContextSnapshot } from "./agentProtocol";
import { agentV6Api, type AgentV6Response, type AgentV6Scope } from "../v6/orchestration/agentV6Api";
import { applyResponse, createReplayState, restoreHistory, type ReplayState } from "../v6/replay/ReplayState";
import type { AgentExecutionMode, ConversationBlock, ResultRef } from "../v6/protocol/conversationTypes";
import type { BriefField } from "../v6/protocol/conversationTypes";

export type AgentRuntimeDecision =
  | { type: "answer_question"; answer: string | string[]; questionId?: string }
  | { type: "edit_brief"; fields: BriefField[] }
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
      ...(item.role ? { role: item.role } : {}),
      label: item.label,
    }];
  });
  return { ...scope, refs, skillIds: [], appIds: [], modelKey: options.modelKey ?? null };
}

function responseState(current: ReplayState, response: AgentV6Response, scope: AgentV6Scope) {
  return applyResponse(current, response, scope);
}

export function useAgentRuntime(initialSessionId?: string | null) {
  const [state, setState] = useState<ReplayState>(() => createReplayState(scopeFromCanvas()));
  const [sessionTitle, setSessionTitle] = useState("新对话");
  const [busy, setBusy] = useState(false);

  const apply = useCallback((response: AgentV6Response, scope: AgentV6Scope) => {
    setState((current) => responseState(current, response, scope));
  }, []);

  const ensureSession = useCallback(async (prompt: string, scope: AgentV6Scope) => {
    if (state.sessionId) return state.sessionId;
    const created = await agentV6Api.createSession({ ...scope, title: buildTitle(prompt), mode: state.mode });
    if (created.mode !== state.mode) await agentV6Api.setMode(created.id, { ...scope, mode: state.mode });
    setSessionTitle(created.title);
    setState((current) => ({ ...current, sessionId: created.id, mode: created.mode }));
    const url = new URL(window.location.href);
    url.searchParams.set("agentSession", created.id);
    window.history.replaceState(window.history.state, "", url);
    return created.id;
  }, [state.mode, state.sessionId]);

  const submitText = useCallback(async (prompt: string, options: SubmitTextOptions = {}) => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    const scope = scopeFromCanvas();
    try {
      const sessionId = await ensureSession(text, scope);
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
    } finally {
      setBusy(false);
    }
  }, [apply, busy, ensureSession]);

  const submitDecision = useCallback(async (decision: AgentRuntimeDecision) => {
    if (!state.sessionId || !state.turnId || busy) return;
    setBusy(true);
    const scope = scopeFromCanvas();
    const payload = decision.type === "answer_question"
      ? { answers: { [decision.questionId ?? "answer"]: decision.answer } }
      : decision.type === "edit_brief"
        ? { instruction: JSON.stringify({ fields: decision.fields.map((field) => ({ key: field.label, value: field.value })) }) }
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
    } finally {
      setBusy(false);
    }
  }, [apply, busy, state.sessionId, state.turnId]);

  const openSession = useCallback(async (sessionId: string) => {
    const scope = scopeFromCanvas();
    try {
      const history = await agentV6Api.getHistory(sessionId, scope);
      setSessionTitle(history.session.title);
      setState(restoreHistory(history, scope));
      const url = new URL(window.location.href);
      url.searchParams.set("agentSession", sessionId);
      window.history.replaceState(window.history.state, "", url);
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : "无法恢复 Agent 会话。", phase: "recoverable_error" }));
      throw error;
    }
  }, []);

  const newConversation = useCallback(() => {
    setSessionTitle("新对话");
    setState(createReplayState(scopeFromCanvas()));
    const url = new URL(window.location.href);
    url.searchParams.delete("agentSession");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  useEffect(() => {
    const sessionId = initialSessionId ?? new URLSearchParams(window.location.search).get("agentSession");
    if (sessionId && sessionId !== state.sessionId) void openSession(sessionId);
  }, [initialSessionId, openSession, state.sessionId]);

  const setExecutionMode = useCallback((mode: AgentExecutionMode) => {
    setState((current) => ({ ...current, mode }));
    if (state.sessionId) void agentV6Api.setMode(state.sessionId, { ...scopeFromCanvas(), mode }).catch(() => undefined);
  }, [state.sessionId]);

  const renameSession = useCallback(async (title: string) => {
    const next = title.trim();
    if (!next || !state.sessionId) return;
    const session = await agentV6Api.renameSession(state.sessionId, { ...scopeFromCanvas(), title: next });
    setSessionTitle(session.title);
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
    busy,
    error: state.error ?? null,
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
    renameSession,
  }), [busy, newConversation, openSession, renameSession, sessionTitle, setExecutionMode, state, submitDecision, submitText]);
}
