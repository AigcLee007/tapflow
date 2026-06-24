import { useCallback, useMemo, useState } from "react";

import { V2HttpError } from "../../services/v2HttpClient";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { buildCanvasAgentSnapshot } from "./canvasAgentSnapshot";
import {
  approveAgentToolCallStream,
  createAgentSession,
  createAgentTurn,
  executeAgentTurnStream,
  openAgentTurnStream,
  readAgentSseStream,
} from "./canvasAgentApi";
import { readAgentToolEventStream } from "./canvasAgentToolEvents";
import type { CanvasAgentToolEvent, CanvasAgentToolTimelineItem } from "./canvasAgentToolTypes";
import { placeAgentGeneratedAssetsOnCanvas } from "./canvasAgentOps";
import { isProductionImageAgentPrompt } from "./canvasAgentProductionIntent";
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

type SessionStatus = "awaiting_approval" | "error" | "executing" | "executing_tool" | "idle" | "thinking";

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
  const [toolTimeline, setToolTimeline] = useState<CanvasAgentToolTimelineItem[]>([]);
  const [usedOfflineFallback, setUsedOfflineFallback] = useState(false);

  const applyToolEvent = useCallback((event: CanvasAgentToolEvent) => {
    if (event.type === "message_delta") {
      if (!event.content.trim()) return;
      setMessages((current) => [...current, createMessage("assistant", event.content)]);
      return;
    }

    if (event.type === "tool_started") {
      setStatus("executing_tool");
      setToolTimeline((current) => {
        const existing = current.find((item) => item.toolCallKey === event.toolCallKey);
        const nextItem: CanvasAgentToolTimelineItem = {
          assetRefs: existing?.assetRefs ?? [],
          estimate: existing?.estimate,
          placedNodeIds: existing?.placedNodeIds,
          status: "running",
          title: event.toolName === "generate_image_batch" ? "Batch image generation" : "Image generation",
          toolCallKey: event.toolCallKey,
          toolName: event.toolName,
          turnId: existing?.turnId,
        };
        return [...current.filter((item) => item.toolCallKey !== event.toolCallKey), nextItem];
      });
      return;
    }

    if (event.type === "approval_required") {
      setStatus("awaiting_approval");
      setToolTimeline((current) => current.map((item) => item.toolCallKey === event.toolCallKey
        ? { ...item, estimate: event.estimate, status: "awaiting_approval", turnId: event.turnId }
        : item));
      return;
    }

    if (event.type === "tool_result") {
      const result = event.result && typeof event.result === "object"
        ? event.result as Record<string, unknown>
        : {};
      const assetRefs = Array.isArray(result.assetRefs)
        ? result.assetRefs as CanvasAgentToolTimelineItem["assetRefs"]
        : [];
      const failed = result.status === "failed";
      setToolTimeline((current) => current.map((item) => {
        if (item.toolCallKey !== event.toolCallKey) return item;
        const shouldAutoPlace = !failed && assetRefs.length > 0 && !item.placedNodeIds?.length;
        const placed = shouldAutoPlace
          ? placeAgentGeneratedAssetsOnCanvas({
              assets: assetRefs,
              sessionId,
              toolCallId: typeof result.toolCallId === "string" ? result.toolCallId : event.toolCallKey,
              turnId: item.turnId ?? null,
            })
          : null;
        return {
          ...item,
          assetRefs,
          placedNodeIds: placed?.createdNodeIds ?? item.placedNodeIds,
          result: event.result,
          status: failed ? "failed" : "succeeded",
          turnId: item.turnId,
        };
      }));
      return;
    }

    if (event.type === "turn_completed") {
      if (event.finalText.trim()) {
        setMessages((current) => [...current, createMessage("assistant", event.finalText)]);
      }
      setStatus("idle");
      return;
    }

    if (event.type === "turn_failed") {
      setError(event.message);
      setMessages((current) => [...current, createMessage("system", event.message)]);
      setStatus("error");
    }
  }, []);

  const sendPrompt = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const allowOfflineFallback = import.meta.env.VITE_AGENT_OFFLINE_FALLBACK === "true";
    const requiresProductionExecutor = isProductionImageAgentPrompt(trimmed);
    const useStreaming = import.meta.env.VITE_AGENT_STREAMING !== "false";

    setError(null);
    setUsedOfflineFallback(false);
    setToolTimeline([]);
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
        setMessages((current) => [
          ...current,
          createMessage(
            "assistant",
            usedOfflineFallback ? `[基础规划模式]\n${plan.reply}` : plan.reply,
          ),
        ]);
        setStatus("awaiting_approval");
      };

      let streamFailedMessage: string | null = null;
      if (useStreaming && resolvedSessionId) {
        try {
          const response = await executeAgentTurnStream(resolvedSessionId, { prompt: trimmed, snapshot });
          if (response.ok) {
            await readAgentToolEventStream(response, applyToolEvent);
            return;
          }
          if (requiresProductionExecutor) {
            throw new Error("真实 Agent 执行器不可用，无法完成生成、对比或套图类生产任务。请先确认服务器已启用 Agent Executor、文本大脑模型和生图线路。");
          }
          if (response.status !== 404 && response.status !== 503) {
            throw new V2HttpError({
              message: `Request failed with status ${response.status}`,
              status: response.status,
            });
          }
        } catch (executorError) {
          streamFailedMessage = executorError instanceof Error ? executorError.message : String(executorError);
          if (requiresProductionExecutor) {
            throw executorError;
          }
        }

        let receivedPlan = false;
        try {
          const response = await openAgentTurnStream(resolvedSessionId, { prompt: trimmed, snapshot });
          if (!response.ok) {
            streamFailedMessage = `Request failed with status ${response.status}`;
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
          streamFailedMessage = streamError instanceof Error ? streamError.message : String(streamError);
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
      setUsedOfflineFallback(true);
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

  const approveToolCall = useCallback(async (toolCallKey: string) => {
    const item = toolTimeline.find((candidate) => candidate.toolCallKey === toolCallKey);
    if (!sessionId || !item?.turnId) {
      setError("Agent approval is missing its session or turn reference.");
      return;
    }

    setError(null);
    setStatus("executing_tool");
    try {
      const response = await approveAgentToolCallStream(sessionId, {
        toolCallKey,
        turnId: item.turnId,
      });
      if (!response.ok) {
        throw new V2HttpError({
          message: `Request failed with status ${response.status}`,
          status: response.status,
        });
      }
      await readAgentToolEventStream(response, applyToolEvent);
    } catch (approvalError) {
      const message = approvalError instanceof Error ? approvalError.message : String(approvalError);
      setError(message);
      setToolTimeline((current) => current.map((candidate) => candidate.toolCallKey === toolCallKey
        ? { ...candidate, error: message, status: "failed" }
        : candidate));
      setStatus("error");
    }
  }, [applyToolEvent, sessionId, toolTimeline]);

  const cancelToolCall = useCallback((toolCallKey: string) => {
    setToolTimeline((current) => current.map((item) => item.toolCallKey === toolCallKey
      ? { ...item, error: "Cancelled by user", status: "failed" }
      : item));
    setStatus("idle");
    setMessages((current) => [...current, createMessage("assistant", "Cancelled. No credits were used for this Agent tool.")]);
  }, []);

  const placeToolAssetsOnCanvas = useCallback((toolCallKey: string) => {
    const item = toolTimeline.find((candidate) => candidate.toolCallKey === toolCallKey);
    if (!item || item.assetRefs.length === 0) return;
    const placed = placeAgentGeneratedAssetsOnCanvas({
      assets: item.assetRefs,
      sessionId,
      toolCallId: typeof (item.result as { toolCallId?: unknown } | null)?.toolCallId === "string"
        ? (item.result as { toolCallId: string }).toolCallId
        : toolCallKey,
      turnId: item.turnId ?? null,
    });
    setToolTimeline((current) => current.map((candidate) => candidate.toolCallKey === toolCallKey
      ? { ...candidate, placedNodeIds: placed.createdNodeIds }
      : candidate));
  }, [sessionId, toolTimeline]);

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
      approveToolCall,
      cancelToolCall,
      currentPlan,
      error,
      executeCurrentPlan,
      messages,
      placeToolAssetsOnCanvas,
      sendPrompt,
      sessionId,
      status,
      usedOfflineFallback,
      toolTimeline,
    }),
    [approveToolCall, cancelCurrentPlan, cancelToolCall, currentPlan, error, executeCurrentPlan, messages, placeToolAssetsOnCanvas, sendPrompt, sessionId, status, usedOfflineFallback, toolTimeline],
  );
}
