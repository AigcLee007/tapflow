import { useCallback, useEffect, useRef, useState } from "react";
import { createV4Turn, openV4EventStream } from "./canvasAgentV4Api";
import type { CanvasAgentV4Task } from "./canvasAgentV4Types";

export function useCanvasAgentV4Session(input: { sessionId?: string; enabled?: boolean }) {
  const [task, setTask] = useState<CanvasAgentV4Task>();
  const sourceRef = useRef<EventSource>();
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const taskRef = useRef<CanvasAgentV4Task>();
  const terminalStatuses = new Set(["succeeded", "partial_success", "needs_review", "failed", "cancelled"]);
  const closeSource = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = undefined;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = undefined;
  }, []);
  const subscribe = useCallback((taskId: string, afterSeq: number) => {
    closeSource();
    sourceRef.current = openV4EventStream(taskId, afterSeq, (event) => {
      const sequence = typeof event.sequence === "number" && Number.isFinite(event.sequence) ? Math.floor(event.sequence) : null;
      if (sequence === null) return;
      setTask((current) => {
        if (!current || current.id !== taskId || sequence <= current.lastSequence || current.events.some((item) => item.sequence === sequence)) return current;
        const eventItems = Array.isArray(event.items) ? event.items : Array.isArray(event.generationItems) ? event.generationItems : undefined;
        const generationItems = eventItems
          ? (() => {
            const prior = current.generationItems ?? [];
            const byId = new Map(prior.map((item) => [item.itemId, item]));
            for (const value of eventItems) {
              if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>).itemId !== "string") continue;
              const item = value as Record<string, unknown>;
              const itemId = item.itemId as string;
              byId.set(itemId, {
                ...(byId.get(itemId) ?? { itemId, status: "queued" }),
                ...(typeof item.pageKey === "string" ? { pageKey: item.pageKey } : {}),
                ...(typeof item.status === "string" ? { status: item.status } : {}),
                ...(typeof item.assetId === "string" ? { assetId: item.assetId } : {}),
                ...(typeof item.errorCode === "string" ? { errorCode: item.errorCode } : {}),
                ...(typeof item.retryCount === "number" && Number.isInteger(item.retryCount) ? { retryCount: item.retryCount } : {}),
              });
            }
            return [...byId.values()];
          })()
          : current.generationItems;
        const next = { ...current, status: typeof event.status === "string" ? event.status : current.status, ...(generationItems ? { generationItems } : {}), lastSequence: Math.max(current.lastSequence, sequence), events: [...current.events, event as CanvasAgentV4Task["events"][number]].sort((a, b) => a.sequence - b.sequence) };
        taskRef.current = next;
        if (terminalStatuses.has(next.status)) closeSource();
        return next;
      });
    }, () => {
      const current = taskRef.current;
      if (!current || current.id !== taskId || terminalStatuses.has(current.status)) return;
      reconnectTimerRef.current = setTimeout(() => subscribe(taskId, taskRef.current?.lastSequence ?? afterSeq), 250);
    });
  }, [closeSource]);
  const sendPrompt = useCallback(async (prompt: string, snapshot?: Record<string, unknown>) => {
    if (!input.enabled || !input.sessionId) throw new Error("AGENT_V4_UNAVAILABLE");
    const result = await createV4Turn(input.sessionId, { prompt, snapshot });
    const taskId = typeof result.taskId === "string" ? result.taskId : undefined;
    if (taskId) {
      const nextTask = { id: taskId, status: typeof result.status === "string" ? result.status : "draft", lastSequence: 0, events: [] } as CanvasAgentV4Task;
      taskRef.current = nextTask;
      setTask(nextTask);
      subscribe(taskId, 0);
    }
    return result;
  }, [input.enabled, input.sessionId, subscribe]);
  useEffect(() => () => closeSource(), [closeSource]);
  return { task, sendPrompt };
}
