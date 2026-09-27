import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentContextSnapshot, AgentDecisionType, AgentTurnResponse } from "./agentProtocol";
import { agentRuntimeApi, type AgentRuntimeApi, type AgentRuntimeSession } from "./agentRuntimeApi";
import { initialAgentRuntimeState, reduceAgentEvents, reduceAgentHistory, reduceAgentTurn, type AgentRuntimeState } from "./agentEventReducer";
import { SessionController } from "./SessionController";

const idempotencyKey = (prefix: string) => {
  const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${uuid}`;
};
const titleFromPrompt = (prompt: string) => {
  const value = prompt.replace(/\s+/g, " ").trim();
  return value.length > 36 ? `${value.slice(0, 36)}…` : value || "新对话";
};

export function useAgentRuntime(options: { projectId: string | null; flowId: string | null; contextSnapshot: AgentContextSnapshot; api?: AgentRuntimeApi }) {
  const api = options.api ?? agentRuntimeApi;
  const controller = useMemo(() => new SessionController(api), [api]);
  const [state, setState] = useState<AgentRuntimeState>(() => initialAgentRuntimeState());
  const [session, setSession] = useState<AgentRuntimeSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const decisionKeys = useRef(new Map<string, string>());
  const stateRef = useRef(state);
  stateRef.current = state;

  const applyResponse = useCallback((response: AgentTurnResponse) => setState((current) => reduceAgentTurn(current, response)), []);
  const ensureSession = useCallback(async (prompt: string) => {
    if (session?.id) return session.id;
    const created = await controller.create({ flowId: options.flowId, projectId: options.projectId, title: titleFromPrompt(prompt), mode: "manual_confirmation" });
    setSession(created);
    return created.id;
  }, [controller, options.flowId, options.projectId, session?.id]);

  const submitTurn = useCallback(async (prompt: string) => {
    const value = prompt.trim();
    if (!value || busy) return null;
    setBusy(true); setError(null);
    try {
      const sessionId = await ensureSession(value);
      const response = await api.submitTurn(sessionId, { contextSnapshot: options.contextSnapshot, idempotencyKey: idempotencyKey("turn"), prompt: value });
      applyResponse(response);
      return response;
    } catch (cause) { const next = cause instanceof Error ? cause : new Error("Agent 请求失败"); setError(next); throw next; }
    finally { setBusy(false); }
  }, [api, applyResponse, busy, ensureSession, options.contextSnapshot]);

  const submitDecision = useCallback(async (input: { blockId: string; type: AgentDecisionType; payload: Record<string, unknown>; graphRevision?: number; decisionId?: string; idempotencyKey?: string }) => {
    if (!session?.id || !state.latest?.turnId || decisionBusy) return null;
    const key = input.idempotencyKey ?? decisionKeys.current.get(input.blockId) ?? idempotencyKey(`decision:${input.type}`);
    decisionKeys.current.set(input.blockId, key);
    setDecisionBusy(true); setError(null);
    try {
      const response = await api.submitDecision(session.id, state.latest.turnId, { ...input, idempotencyKey: key });
      applyResponse(response);
      return response;
    } catch (cause) { const next = cause instanceof Error ? cause : new Error("Decision 提交失败"); setError(next); throw next; }
    finally { setDecisionBusy(false); }
  }, [api, applyResponse, decisionBusy, session?.id, state.latest?.turnId]);

  const openSession = useCallback(async (id: string) => {
    setBusy(true); setError(null);
    try {
      const history = await controller.open(id);
      setSession(history.session);
      setState((current) => reduceAgentHistory(current, history.turns, current.replayCursor));
      try {
        const replay = await api.listEvents(id, { afterSeq: 0 });
        setState((current) => reduceAgentEvents(current, replay.events, replay.replayCursor, replay.lastSeq));
      } catch (cause) {
        if ((cause as { code?: string } | null)?.code === "REPLAY_RESYNC_REQUIRED" || (cause instanceof Error && cause.message.includes("REPLAY_RESYNC_REQUIRED"))) setState((current) => reduceAgentHistory(current, history.turns, current.replayCursor));
      }
      return history;
    }
    catch (cause) { const next = cause instanceof Error ? cause : new Error("无法打开会话"); setError(next); throw next; }
    finally { setBusy(false); }
  }, [controller]);
  const newConversation = useCallback(() => { controller.clear(); setSession(null); setState(initialAgentRuntimeState()); setError(null); decisionKeys.current.clear(); }, [controller]);
  const setMode = useCallback(async (mode: "auto" | "manual_confirmation") => { if (!session?.id) return null; const next = await api.setMode(session.id, mode); setSession(next); return next; }, [api, session?.id]);
  const cancel = useCallback(async (reason?: string) => { if (!session?.id || !state.latest) return null; const response = await api.cancel(session.id, { graphRevision: state.latest.graphRevision, idempotencyKey: idempotencyKey("cancel"), reason, turnId: state.latest.turnId }); applyResponse(response); return response; }, [api, applyResponse, session?.id, state.latest]);

  useEffect(() => {
    if (!session?.id || !api.streamEvents) return;
    const controllerAbort = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const consume = async () => {
      try {
        await api.streamEvents?.(session.id, { afterSeq: stateRef.current.lastSeq, replayCursor: stateRef.current.replayCursor, signal: controllerAbort.signal }, (event) => {
          if (event.seq > stateRef.current.lastSeq + 1) {
            void api.getHistory(session.id).then((history) => setState((current) => reduceAgentHistory(current, history.turns, current.replayCursor))).catch(() => undefined);
            return;
          }
          setState((current) => reduceAgentEvents(current, [event], event.replayCursor, event.seq));
        });
      } catch (cause) {
        if (stopped || controllerAbort.signal.aborted) return;
        if ((cause as { code?: string } | null)?.code === "REPLAY_RESYNC_REQUIRED" || (cause instanceof Error && cause.message.includes("REPLAY_RESYNC_REQUIRED"))) {
          try { const history = await api.getHistory(session.id); setState((current) => reduceAgentHistory(current, history.turns, current.replayCursor)); } catch { /* retry below */ }
        }
      }
      if (!stopped) retryTimer = setTimeout(() => { void consume(); }, 250);
    };
    void consume();
    return () => { stopped = true; controllerAbort.abort(); if (retryTimer) clearTimeout(retryTimer); };
  }, [api, session?.id]);

  return { ...state, session, busy, decisionBusy, error, submitTurn, submitDecision, openSession, newConversation, setMode, cancel };
}
