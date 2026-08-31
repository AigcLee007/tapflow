import { useCallback, useEffect, useRef, useState } from "react";
import { createV4Turn, openV4EventStream } from "./canvasAgentV4Api";
import type { CanvasAgentV4Task } from "./canvasAgentV4Types";

export function useCanvasAgentV4Session(input: { sessionId?: string; enabled?: boolean }) {
  const [task, setTask] = useState<CanvasAgentV4Task>();
  const sourceRef = useRef<EventSource>();
  const sendPrompt = useCallback(async (prompt: string, snapshot?: Record<string, unknown>) => {
    if (!input.enabled || !input.sessionId) throw new Error("AGENT_V4_UNAVAILABLE");
    const result = await createV4Turn(input.sessionId, { prompt, snapshot });
    const taskId = typeof result.taskId === "string" ? result.taskId : undefined;
    if (taskId) {
      setTask({ id: taskId, status: typeof result.status === "string" ? result.status : "draft", lastSequence: 0, events: [] });
      sourceRef.current?.close();
      sourceRef.current = openV4EventStream(taskId, 0, (event) => setTask((current) => current ? { ...current, status: typeof event.status === "string" ? event.status : current.status, lastSequence: typeof event.sequence === "number" ? event.sequence : current.lastSequence, events: [...current.events, event] } : current));
    }
    return result;
  }, [input.enabled, input.sessionId]);
  useEffect(() => () => sourceRef.current?.close(), []);
  return { task, sendPrompt };
}
