import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPost, getStoredAccessToken } from "../../../services/v2HttpClient";
import { readAgentSseStream } from "../canvasAgentApi";
import { reduceCanvasAgentV3Event } from "./canvasAgentTaskProjection";
import type { CanvasAgentV3Event, CanvasAgentV3Task } from "./canvasAgentV3Types";

type StreamOptions = { sessionId: string | null; taskId?: string | null; autoConnect?: boolean };
type ActionResult = Record<string, unknown>;
const terminal = new Set(["succeeded", "partial_success", "failed", "cancelled"]);
const emptyTask = (id: string): CanvasAgentV3Task => ({ id, status: "draft", lastSequence: 0, events: [] });

function parseEvent(data: unknown): CanvasAgentV3Event | null {
  if (!data || typeof data !== "object") return null;
  const item = data as Record<string, unknown>;
  if (!Number.isInteger(item.sequence) || typeof item.type !== "string") return null;
  return { sequence: item.sequence as number, type: item.type, ...(typeof item.status === "string" ? { status: item.status as CanvasAgentV3Event["status"] } : {}), ...(typeof item.stepId === "string" ? { stepId: item.stepId } : {}), ...(item.payload && typeof item.payload === "object" ? { payload: item.payload as Record<string, unknown> } : {}) };
}

async function postAction(taskId: string, action: string, body?: unknown): Promise<ActionResult> {
  return apiPost<ActionResult>(`/agent/v3/tasks/${encodeURIComponent(taskId)}/${action}`, body);
}

export function useCanvasAgentTaskStream(options: StreamOptions) {
  const { sessionId, taskId, autoConnect = false } = options;
  const [task, setTask] = useState<CanvasAgentV3Task | null>(() => taskId ? emptyTask(taskId) : null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const stopped = useRef(false);
  const terminalSeen = useRef(false);
  const taskRef = useRef(task);
  taskRef.current = task;

  const accept = useCallback((data: unknown) => {
    const event = parseEvent(data);
    if (!event) return;
    if (event.status && terminal.has(event.status)) terminalSeen.current = true;
    setTask((current) => {
      const id = current?.id || (typeof (data as Record<string, unknown>)?.taskId === "string" ? (data as Record<string, string>).taskId : taskId);
      if (!id) return current;
      return reduceCanvasAgentV3Event(current || emptyTask(id), event);
    });
  }, [taskId]);

  const connect = useCallback(async () => {
    const id = taskRef.current?.id || taskId;
    if (!sessionId || !id) return;
    stopped.current = false;
    terminalSeen.current = false;
    setError(null);
    let attempts = 0;
    while (!stopped.current) {
      const after = taskRef.current?.lastSequence ?? 0;
      try {
        const token = getStoredAccessToken();
        const query = new URLSearchParams({ after: String(after) });
        const response = await fetch(`/api/v2/agent/v3/tasks/${encodeURIComponent(id)}/events?${query}`, { cache: "no-store", headers: token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {}, method: "GET" });
        if (!response.ok) throw new Error(`Canvas Agent V3 stream failed with status ${response.status}`);
        setConnected(true); attempts = 0;
        await readAgentSseStream(response, { onEvent: accept, onMessage: accept, onPlan: accept, onDone: accept });
        setConnected(false);
        if (terminalSeen.current || terminal.has(taskRef.current?.status || "")) return;
      } catch (cause) {
        setConnected(false); setError(cause instanceof Error ? cause : new Error("Canvas Agent V3 stream failed"));
      }
      if (stopped.current) return;
      const delay = Math.min(1000 * 2 ** attempts, 8000); attempts += 1;
      await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
    }
  }, [accept, sessionId, taskId]);

  const disconnect = useCallback(() => { stopped.current = true; setConnected(false); }, []);
  useEffect(() => { if (autoConnect) void connect(); return disconnect; }, [autoConnect, connect, disconnect]);
  const sendPrompt = useCallback(async (prompt: string, body?: Record<string, unknown>) => {
    if (!sessionId) throw new Error("Canvas Agent V3 requires a session");
    const token = getStoredAccessToken();
    const response = await fetch(`/api/v2/agent/v3/sessions/${encodeURIComponent(sessionId)}/turns/stream`, { body: JSON.stringify({ prompt, ...body }), cache: "no-store", headers: { "Content-Type": "application/json", ...(token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {}) }, method: "POST" });
    if (!response.ok) throw new Error(`Canvas Agent V3 prompt failed with status ${response.status}`);
    await readAgentSseStream(response, { onEvent: accept, onMessage: accept, onPlan: accept, onDone: accept });
    return taskRef.current;
  }, [accept, sessionId]);
  const approve = useCallback((approved = true, input?: unknown) => postAction(taskRef.current?.id || taskId || "", "approve", { approved, ...(input === undefined ? {} : { input }) }), [taskId]);
  const cancel = useCallback(() => postAction(taskRef.current?.id || taskId || "", "cancel"), [taskId]);
  const retryStep = useCallback((stepId: string) => postAction(taskRef.current?.id || taskId || "", "retry-step", { stepId }), [taskId]);
  const undoCanvas = useCallback((expectedRevision: number) => postAction(taskRef.current?.id || taskId || "", "undo-canvas", { expectedRevision }), [taskId]);
  return useMemo(() => ({ task, connected, error, connect, disconnect, sendPrompt, approve, cancel, retryStep, undoCanvas }), [approve, cancel, connect, connected, disconnect, error, retryStep, sendPrompt, task, undoCanvas]);
}
