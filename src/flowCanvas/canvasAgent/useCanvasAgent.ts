import { useCallback, useEffect, useRef, useState } from "react";

import { V2HttpError } from "../../services/v2HttpClient";
import { canvasAgentApi } from "./canvasAgentApi";
import { applyAgentEvent, summarizeAnswers, transcriptFromHistory, updateCard, type TranscriptItem } from "./canvasAgentTranscript";
import type {
  CanvasAgentAnswersPayload,
  CanvasAgentApprovalPayload,
  CanvasAgentEvent,
  CanvasAgentFileSummary,
  CanvasAgentGenerationResult,
  CanvasAgentMode,
  CanvasAgentQuestion,
  CanvasAgentSession,
  CanvasSnapshot,
} from "./canvasAgentTypes";

export type AgentPhase = "idle" | "organizing" | "running_tools" | "thinking";

type StreamCall = (onEvent: (event: CanvasAgentEvent) => void, signal: AbortSignal) => Promise<void>;

const errorMessage = (error: unknown) => (error instanceof V2HttpError || error instanceof Error ? error.message : "请求失败，请重试。");
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useCanvasAgent(input: { flowId: string | null; getCanvas: () => CanvasSnapshot | null }) {
  const { flowId, getCanvas } = input;
  const [session, setSession] = useState<CanvasAgentSession | null>(null);
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [mode, setModeState] = useState<CanvasAgentMode>("manual");
  const [history, setHistory] = useState<CanvasAgentSession[]>([]);
  const [files, setFiles] = useState<CanvasAgentFileSummary[]>([]);
  const sessionRef = useRef<CanvasAgentSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  sessionRef.current = session;

  const refreshHistory = useCallback(async () => {
    if (!flowId) return;
    setHistory(await canvasAgentApi.listSessions(flowId).catch(() => []));
  }, [flowId]);
  const refreshFiles = useCallback(async () => {
    if (!flowId) return;
    setFiles(await canvasAgentApi.listFiles(flowId).catch(() => []));
  }, [flowId]);

  useEffect(() => { void refreshHistory(); void refreshFiles(); }, [refreshHistory, refreshFiles]);
  useEffect(() => () => abortRef.current?.abort(), []);

  /** Reload from the server; used after errors so the UI never shows a state the server does not have. */
  const reload = useCallback(async (sessionId: string) => {
    const detail = await canvasAgentApi.getSession(sessionId);
    setSession(detail.session);
    setModeState(detail.session.mode);
    setItems(transcriptFromHistory(detail.messages, detail.session));
  }, []);

  const runStream = useCallback(async (call: StreamCall, options?: { reloadOnError?: boolean }) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setPhase("thinking");
    setStartedAt(Date.now());
    const onEvent = (event: CanvasAgentEvent) => {
      setItems((previous) => applyAgentEvent(previous, event));
      if (event.type === "status") setPhase(event.phase);
      if (event.type === "file_updated") void refreshFiles();
    };
    try {
      await call(onEvent, controller.signal);
    } catch (error) {
      if (isAbort(error)) setItems((previous) => applyAgentEvent(previous, { reason: "cancelled", type: "done" }));
      else if (options?.reloadOnError && sessionRef.current) await reload(sessionRef.current.id).catch(() => undefined);
      if (!isAbort(error)) setItems((previous) => [...previous, { id: `error-${Date.now()}`, kind: "error", message: errorMessage(error) }]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
      setPhase("idle");
      setStartedAt(null);
      const current = sessionRef.current;
      if (current) {
        void canvasAgentApi.getSession(current.id).then((detail) => setSession(detail.session)).catch(() => undefined);
      }
      void refreshHistory();
    }
  }, [refreshFiles, refreshHistory, reload]);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || busy || !flowId) return;
    let current = sessionRef.current;
    if (!current) {
      try {
        current = await canvasAgentApi.createSession(flowId, mode);
      } catch (error) {
        setItems((previous) => [...previous, { id: `error-${Date.now()}`, kind: "error", message: errorMessage(error) }]);
        return;
      }
      setSession(current);
      sessionRef.current = current;
    }
    const sessionId = current.id;
    // Typing instead of answering an open card skips that card (the server records the same).
    setItems((previous) => [
      ...previous.map((item) => ((item.kind === "questions" && item.state === "open") || (item.kind === "generation" && item.state === "approval")
        ? ({ ...item, state: "skipped" } as TranscriptItem)
        : item)),
      { id: `user-${Date.now()}`, kind: "user", text: content },
    ]);
    await runStream(async (onEvent, signal) => {
      const request = () => canvasAgentApi.sendMessage(sessionId, { canvas: getCanvas(), content }, onEvent, signal);
      try {
        await request();
      } catch (error) {
        // Right after "stop" the server may still be releasing the session.
        if (error instanceof V2HttpError && error.code === "CANVAS_AGENT_BUSY") { await wait(1200); await request(); }
        else throw error;
      }
    });
  }, [busy, flowId, getCanvas, mode, runStream]);

  const answerQuestions = useCallback(async (callId: string, questions: CanvasAgentQuestion[], payload: CanvasAgentAnswersPayload) => {
    const sessionId = sessionRef.current?.id;
    if (!sessionId || busy) return;
    setItems((previous) => updateCard(previous, callId, { answers: summarizeAnswers(questions, payload.answers), state: "answered" }));
    await runStream((onEvent, signal) => canvasAgentApi.resume(sessionId, { callId, canvas: getCanvas(), payload }, onEvent, signal), { reloadOnError: true });
  }, [busy, getCanvas, runStream]);

  const decideGeneration = useCallback(async (callId: string, payload: CanvasAgentApprovalPayload) => {
    const sessionId = sessionRef.current?.id;
    if (!sessionId || busy) return;
    setItems((previous) => updateCard(previous, callId, { state: payload.approved ? "generating" : "rejected" }));
    await runStream((onEvent, signal) => canvasAgentApi.resume(sessionId, { callId, canvas: getCanvas(), payload }, onEvent, signal), { reloadOnError: true });
  }, [busy, getCanvas, runStream]);

  /** Phase 3: the canvas executor reports what it generated. */
  const reportGeneration = useCallback(async (callId: string, results: CanvasAgentGenerationResult[]) => {
    const sessionId = sessionRef.current?.id;
    if (!sessionId) return;
    setItems((previous) => previous.map((item) => (item.kind === "generation" && item.callId === callId ? { ...item, results, state: "done" } : item)));
    await runStream((onEvent, signal) => canvasAgentApi.resume(sessionId, { callId, canvas: getCanvas(), payload: { results } }, onEvent, signal), { reloadOnError: true });
  }, [getCanvas, runStream]);

  const stop = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    if (abortRef.current) {
      void canvasAgentApi.stop(current.id).catch(() => undefined);
      abortRef.current.abort();
      return;
    }
    if (current.status === "waiting" && current.pending) {
      const callId = current.pending.callId;
      await canvasAgentApi.stop(current.id).catch(() => undefined);
      setItems((previous) => updateCard(previous, callId, { state: "cancelled" }));
      await reload(current.id).catch(() => undefined);
    }
  }, [reload]);

  const newConversation = useCallback(() => {
    if (busy) return;
    setSession(null);
    sessionRef.current = null;
    setItems([]);
  }, [busy]);

  const openSession = useCallback(async (sessionId: string) => {
    if (busy) return;
    await reload(sessionId).catch((error) => setItems([{ id: `error-${Date.now()}`, kind: "error", message: errorMessage(error) }]));
  }, [busy, reload]);

  const setMode = useCallback(async (next: CanvasAgentMode) => {
    setModeState(next);
    const current = sessionRef.current;
    if (current) setSession(await canvasAgentApi.updateSession(current.id, { mode: next }).catch(() => current));
  }, []);

  const rename = useCallback(async (title: string) => {
    const current = sessionRef.current;
    if (!current || !title.trim()) return;
    setSession(await canvasAgentApi.updateSession(current.id, { title: title.trim() }).catch(() => current));
    void refreshHistory();
  }, [refreshHistory]);

  return {
    answerQuestions, busy, decideGeneration, files, history, items, mode, newConversation, openSession, phase,
    refreshFiles, rename, reportGeneration, send, session, setMode, startedAt, stop,
  };
}

export type CanvasAgentController = ReturnType<typeof useCanvasAgent>;
