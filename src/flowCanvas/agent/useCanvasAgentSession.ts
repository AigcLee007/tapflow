import { useCallback, useMemo, useState } from "react";

import { V2HttpError } from "../../services/v2HttpClient";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { buildCanvasAgentSnapshot } from "./canvasAgentSnapshot";
import { createAgentSession, createAgentTurn, openAgentTurnStream, readAgentSseStream } from "./canvasAgentApi";
import { planOfflineCanvasAgentTurn } from "./offlineCanvasAgentPlanner";
import type { CanvasAgentPlannerOutput } from "./canvasAgentTypes";

export type CanvasAgentMessage = {
  content: string;
  id: string;
  role: "assistant" | "system" | "user";
};

type ApplyResult = {
  createdNodeIds: string[];
  errors: Array<{ message: string }>;
  ok: boolean;
  ranNodeIds: string[];
};

type SessionStatus = "awaiting_approval" | "error" | "executing" | "idle" | "thinking";

const allowOfflineFallback = import.meta.env.DEV || import.meta.env.VITE_AGENT_OFFLINE_FALLBACK === "true";
const useStreaming = import.meta.env.VITE_AGENT_STREAMING !== "false";

function createMessage(role: CanvasAgentMessage["role"], content: string): CanvasAgentMessage {
  return {
    content,
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
  };
}

export function useCanvasAgentSession() {
  const [messages, setMessages] = useState<CanvasAgentMessage[]>([]);
  const [currentPlan, setCurrentPlan] = useState<CanvasAgentPlannerOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");

  const sendPrompt = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    setError(null);
    setStatus("thinking");
    setMessages((current) => [...current, createMessage("user", trimmed)]);

    try {
      const state = useFlowCanvasStore.getState();
      const snapshot = buildCanvasAgentSnapshot({
        edges: state.edges,
        flowId: state.backendFlowId,
        nodeOutputs: state.nodeOutputByNodeId,
        nodes: state.nodes,
        projectId: state.backendProjectId ?? state.projectId ?? null,
        viewport: state.viewport,
      });

      let resolvedSessionId = sessionId;
      if (!resolvedSessionId) {
        const session = await createAgentSession({
          flowId: state.backendFlowId,
          projectId: state.backendProjectId ?? state.projectId ?? null,
          title: "Canvas Agent",
        });
        resolvedSessionId = session.id;
        setSessionId(session.id);
      }

      const applyPlan = (plan: CanvasAgentPlannerOutput) => {
        setCurrentPlan(plan);
        setMessages((current) => [...current, createMessage("assistant", plan.reply)]);
        setStatus("awaiting_approval");
      };

      if (useStreaming && resolvedSessionId) {
        let receivedPlan = false;
        try {
          const response = await openAgentTurnStream(resolvedSessionId, { prompt: trimmed, snapshot });
          if (!response.ok) {
            throw new V2HttpError({
              message: `Request failed with status ${response.status}`,
              status: response.status,
            });
          }

          await readAgentSseStream(response, {
            onError: (data) => {
              throw new Error(typeof data === "object" && data && "message" in (data as Record<string, unknown>)
                ? String((data as Record<string, unknown>).message)
                : "Agent planning stream failed.");
            },
            onPlan: (data) => {
              receivedPlan = true;
              applyPlan(data as CanvasAgentPlannerOutput);
            },
          });

          if (receivedPlan) {
            return;
          }
        } catch (streamError) {
          if (!allowOfflineFallback) {
            throw streamError;
          }
        }
      }

      if (resolvedSessionId) {
        try {
          const plan = await createAgentTurn(resolvedSessionId, { prompt: trimmed, snapshot });
          applyPlan(plan);
          return;
        } catch (apiError) {
          if (
            apiError instanceof V2HttpError &&
            (apiError.status === 401 || apiError.status === 403)
          ) {
            throw apiError;
          }
          if (!allowOfflineFallback) {
            throw apiError;
          }
        }
      }

      const offlinePlan = planOfflineCanvasAgentTurn({ prompt: trimmed, snapshot });
      applyPlan(offlinePlan);
    } catch (planError) {
      const message = planError instanceof Error ? planError.message : String(planError);
      setError(message);
      setMessages((current) => [...current, createMessage("system", message)]);
      setStatus("error");
    }
  }, [sessionId]);

  const cancelCurrentPlan = useCallback(() => {
    setCurrentPlan(null);
    setStatus("idle");
    setError(null);
  }, []);

  const executeCurrentPlan = useCallback(
    async (
      executor: (plan: CanvasAgentPlannerOutput) => Promise<ApplyResult>,
      options?: { omitRunNode?: boolean },
    ) => {
      if (!currentPlan) return;
      setError(null);
      setStatus("executing");

      try {
        const planToRun = options?.omitRunNode
          ? {
              ...currentPlan,
              proposedOps: currentPlan.proposedOps.filter((op) => op.type !== "run_node"),
            }
          : currentPlan;
        const result = await executor(planToRun);
        if (!result.ok) {
          throw new Error(result.errors[0]?.message || "Agent 执行失败。");
        }

        const fragments: string[] = [];
        if (result.createdNodeIds.length > 0) fragments.push(`创建了 ${result.createdNodeIds.length} 个节点`);
        if (result.ranNodeIds.length > 0) fragments.push(`启动了 ${result.ranNodeIds.length} 个生成任务`);
        setMessages((current) => [
          ...current,
          createMessage("assistant", fragments.length > 0 ? `计划已执行：${fragments.join("，")}。` : "计划已执行。"),
        ]);
        setCurrentPlan(null);
        setStatus("idle");
      } catch (executionError) {
        const message = executionError instanceof Error ? executionError.message : String(executionError);
        setError(message);
        setMessages((current) => [...current, createMessage("system", `执行失败：${message}`)]);
        setStatus("error");
      }
    },
    [currentPlan],
  );

  return useMemo(
    () => ({
      cancelCurrentPlan,
      currentPlan,
      error,
      executeCurrentPlan,
      messages,
      sendPrompt,
      sessionId,
      status,
    }),
    [cancelCurrentPlan, currentPlan, error, executeCurrentPlan, messages, sendPrompt, sessionId, status],
  );
}
