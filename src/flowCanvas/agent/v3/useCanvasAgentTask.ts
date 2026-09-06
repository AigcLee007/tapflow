import { useCallback, useMemo } from "react";
import { useCanvasAgentTaskStream } from "./useCanvasAgentTaskStream";
import type { CanvasAgentV3RuntimeIdentity } from "./canvasAgentV3Types";

export function useCanvasAgentTask(input: { sessionId?: string; taskId?: string; runtimeIdentity: CanvasAgentV3RuntimeIdentity }) {
  const stream = useCanvasAgentTaskStream({ sessionId: input.sessionId, taskId: input.taskId });
  const sendPrompt = useCallback(async (prompt: string) => { if (input.runtimeIdentity !== "v3_real") throw new Error("AGENT_V3_UNAVAILABLE"); return stream.sendPrompt(prompt); }, [input.runtimeIdentity, stream.sendPrompt]);
  return useMemo(() => ({ ...stream, sendPrompt, runtimeIdentity: input.runtimeIdentity }), [input.runtimeIdentity, sendPrompt, stream]);
}
