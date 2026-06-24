import { useCallback, useMemo, useState } from "react";

import { V2HttpError } from "../../services/v2HttpClient";
import { flushRemoteDraftBeforeRun } from "../runtime/remoteDraftSaveBarrier";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { buildCanvasAgentSnapshot } from "./canvasAgentSnapshot";
import {
  type AgentContinuationContext,
  type AgentSessionEvent,
  approveAgentToolCallStream,
  createAgentSession,
  createAgentTurn,
  executeAgentTurnStream,
  getAgentImageRunSettings,
  openAgentTurnStream,
  readAgentSseStream,
} from "./canvasAgentApi";
import type { CanvasAgentActivityItem } from "./CanvasAgentActivityTimeline";
import type { AgentImageRunSettingsSelection } from "./agentRunSettings";
import { placeAgentGeneratedAssetsOnCanvas } from "./canvasAgentOps";
import { isProductionImageAgentPrompt } from "./canvasAgentProductionIntent";
import type { CanvasAgentPlannerOutput } from "./canvasAgentTypes";
import { readAgentToolEventStream } from "./canvasAgentToolEvents";
import type {
  CanvasAgentContinuationAction,
  CanvasAgentToolEvent,
  CanvasAgentToolTimelineItem,
} from "./canvasAgentToolTypes";
import { buildReplayMessages, buildToolTimelineFromSessionEvents, deriveReplaySessionStatus } from "./agentReplayState";
import { planOfflineCanvasAgentTurn } from "./offlineCanvasAgentPlanner";

export type CanvasAgentMessage = {
  content: string;
  id: string;
  metadata?: Record<string, unknown>;
  role: "assistant" | "system" | "user";
};

type PendingContinuation = AgentContinuationContext;

type ApplyResult = {
  createdNodeIds: string[];
  errors: Array<{ message: string }>;
  ok: boolean;
  ranNodeIds: string[];
};

type SessionStatus = "awaiting_approval" | "error" | "executing" | "executing_tool" | "idle" | "thinking";

const DEFAULT_AGENT_IMAGE_ROUTE_KEY = "image.default";

function getToolTitle(toolName: string) {
  if (toolName === "generate_image_batch") return "Batch image generation";
  if (toolName === "edit_image") return "Image edit";
  return "Image generation";
}

function createMessage(
  role: CanvasAgentMessage["role"],
  content: string,
  metadata?: Record<string, unknown>,
): CanvasAgentMessage {
  return {
    content,
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metadata,
    role,
  };
}

function getContinuationActionLabel(action: CanvasAgentContinuationAction) {
  if (action === "continue-edit") return "继续编辑";
  if (action === "make-variant") return "做变体";
  if (action === "make-poster") return "做海报";
  return "做对比图";
}

function getAgentProductionNodePosition() {
  const state = useFlowCanvasStore.getState();
  return {
    x: -state.viewport.x / state.viewport.zoom + 220,
    y: -state.viewport.y / state.viewport.zoom + 180,
  };
}

function prepareProductionImageTargetNode(prompt: string): string | null {
  if (!isProductionImageAgentPrompt(prompt)) return null;
  const state = useFlowCanvasStore.getState();
  const selectedImage = state.nodes.find((node) => node.selected && node.data.kind === "image");
  if (selectedImage) return selectedImage.id;

  const firstImage = state.nodes.find((node) => node.data.kind === "image");
  if (firstImage) {
    state.selectNodesByIds([firstImage.id]);
    return firstImage.id;
  }

  const node = state.addNode(
    "image",
    getAgentProductionNodePosition(),
    {
      agentMetadata: {
        creationStage: "agent_auto_target",
        productionLayer: "execution",
      },
      generationPrompt: prompt,
      generationStatus: "idle",
      routeKey: DEFAULT_AGENT_IMAGE_ROUTE_KEY,
      title: "Agent 图片生成",
    },
    { selected: true },
  );
  return node.id;
}

function normalizeSelectedRefIds(item: CanvasAgentToolTimelineItem, nextRefId?: string) {
  const current = item.selectedAssetRefIds?.length
    ? item.selectedAssetRefIds
    : item.activeAssetRefId
      ? [item.activeAssetRefId]
      : item.assetRefs[0]
        ? [item.assetRefs[0].refId]
        : [];

  if (!nextRefId) return current;
  if (current.includes(nextRefId)) {
    const filtered = current.filter((refId) => refId !== nextRefId);
    return filtered.length > 0 ? filtered : [nextRefId];
  }
  return [...current, nextRefId];
}

export function useCanvasAgentSession() {
  const [messages, setMessages] = useState<CanvasAgentMessage[]>([]);
  const [currentPlan, setCurrentPlan] = useState<CanvasAgentPlannerOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [toolTimeline, setToolTimeline] = useState<CanvasAgentToolTimelineItem[]>([]);
  const [usedOfflineFallback, setUsedOfflineFallback] = useState(false);
  const [activityTimeline, setActivityTimeline] = useState<CanvasAgentActivityItem[]>([]);
  const [pendingContinuation, setPendingContinuation] = useState<PendingContinuation | null>(null);
  const [lastContinuation, setLastContinuation] = useState<PendingContinuation | null>(null);

  const appendActivity = useCallback((item: CanvasAgentActivityItem) => {
    setActivityTimeline((current) => [...current, item]);
  }, []);

  const applyToolEvent = useCallback((event: CanvasAgentToolEvent) => {
    if (event.type === "thinking_status") {
      appendActivity({
        detail: event.detail,
        id: `thinking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: event.label,
        state: "active",
      });
      return;
    }

    if (event.type === "message_delta") {
      if (!event.content.trim()) return;
      setMessages((current) => [...current, createMessage("assistant", event.content)]);
      return;
    }

    if (event.type === "tool_started") {
      setStatus("executing_tool");
      appendActivity({
        detail: "The Agent has created the execution task and started running it.",
        id: `tool-start-${event.toolCallKey}`,
        label: "Submitting generation task",
        state: "active",
      });
      setToolTimeline((current) => {
        const existing = current.find((item) => item.toolCallKey === event.toolCallKey);
        const nextItem: CanvasAgentToolTimelineItem = {
          activeAssetRefId: existing?.activeAssetRefId,
          assetRefs: existing?.assetRefs ?? [],
          estimate: existing?.estimate,
          placedNodeIds: existing?.placedNodeIds,
          selectedAssetRefIds: existing?.selectedAssetRefIds,
          status: "running",
          taskId: existing?.taskId,
          title: getToolTitle(event.toolName),
          toolCallKey: event.toolCallKey,
          toolName: event.toolName,
          turnId: existing?.turnId,
        };
        return [...current.filter((item) => item.toolCallKey !== event.toolCallKey), nextItem];
      });
      return;
    }

    if (event.type === "task_created") {
      setToolTimeline((current) => current.map((item) => item.toolCallKey === event.toolCallKey
        ? {
            ...item,
            taskId: event.taskId,
            title: event.title || item.title,
            toolName: event.toolName || item.toolName,
          }
        : item));
      return;
    }

    if (event.type === "workflow_run_linked") {
      appendActivity({
        detail: `Workflow run ${event.workflowRunId} is now attached to this Agent step.`,
        id: `workflow-${event.toolCallKey}-${event.workflowRunId}`,
        label: "Waiting for model result",
        state: "active",
      });
      return;
    }

    if (event.type === "artifact_created") {
      setToolTimeline((current) => current.map((item) => {
        if (item.toolCallKey !== event.toolCallKey) return item;
        const alreadyPresent = item.assetRefs.some((asset) => asset.refId === event.assetRef.refId);
        const nextAssetRefs = alreadyPresent ? item.assetRefs : [...item.assetRefs, event.assetRef];
        return {
          ...item,
          activeAssetRefId: event.assetRef.refId,
          assetRefs: nextAssetRefs,
          selectedAssetRefIds: item.selectedAssetRefIds?.length ? item.selectedAssetRefIds : [event.assetRef.refId],
          taskId: event.taskId || item.taskId,
        };
      }));
      return;
    }

    if (event.type === "approval_required") {
      setStatus("awaiting_approval");
      appendActivity({
        detail: "The Agent needs your confirmation before spending credits.",
        id: `approval-${event.toolCallKey}`,
        label: "Waiting for parameter confirmation",
        state: "active",
      });
      setToolTimeline((current) => current.map((item) => item.toolCallKey === event.toolCallKey
        ? { ...item, estimate: event.estimate, status: "awaiting_approval", turnId: event.turnId }
        : item));
      void getAgentImageRunSettings()
        .then((response) => {
          setToolTimeline((current) => current.map((item) => item.toolCallKey === event.toolCallKey
            ? {
                ...item,
                estimate: {
                  ...(item.estimate ?? {}),
                  ...(event.estimate ?? {}),
                  imageRunSettings: response.models,
                },
              }
            : item));
        })
        .catch(() => {});
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
      appendActivity({
        detail: failed
          ? "The upstream generation step did not return a usable result."
          : "The result is back and ready to save or place on the canvas.",
        id: `result-${event.toolCallKey}`,
        label: failed ? "Generation failed" : "Saving result",
        state: failed ? "failed" : "completed",
      });
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
          activeAssetRefId: item.activeAssetRefId ?? assetRefs[assetRefs.length - 1]?.refId,
          assetRefs,
          estimate: item.estimate,
          placedNodeIds: placed?.createdNodeIds ?? item.placedNodeIds,
          result: event.result,
          selectedAssetRefIds: item.selectedAssetRefIds?.length
            ? item.selectedAssetRefIds
            : assetRefs.length > 0
              ? [assetRefs[0]!.refId]
              : [],
          status: failed ? "failed" : "succeeded",
          taskId: typeof result.toolCallId === "string" ? result.toolCallId : item.taskId,
          turnId: item.turnId,
        };
      }));
      return;
    }

    if (event.type === "turn_completed") {
      if (event.finalText.trim()) {
        setMessages((current) => [...current, createMessage("assistant", event.finalText)]);
      }
      appendActivity({
        detail: "This Agent turn has finished.",
        id: `turn-complete-${event.turnId}`,
        label: "Completed",
        state: "completed",
      });
      setStatus("idle");
      return;
    }

    if (event.type === "turn_failed") {
      setError(event.message);
      setMessages((current) => [...current, createMessage("system", event.message)]);
      appendActivity({
        detail: event.message,
        id: `turn-failed-${event.turnId ?? Date.now()}`,
        label: "Execution failed",
        state: "failed",
      });
      setStatus("error");
    }
  }, [appendActivity, sessionId]);

  const hydrateReplayEvents = useCallback((events: AgentSessionEvent[]) => {
    setToolTimeline(buildToolTimelineFromSessionEvents(events));
    const replayState = deriveReplaySessionStatus(events);
    setStatus(replayState.status);
    setError(replayState.error);
    setMessages((current) => buildReplayMessages(current, events));
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
    setActivityTimeline([]);
    setStatus("thinking");
    const activeContinuation = pendingContinuation;
    if (activeContinuation) {
      setLastContinuation(activeContinuation);
    }
    setMessages((current) => [
      ...current,
      createMessage(
        "user",
        trimmed,
        activeContinuation
          ? {
              continuationContext: {
                ...activeContinuation,
                actionLabel: getContinuationActionLabel(activeContinuation.action),
              },
            }
          : undefined,
      ),
    ]);
    setPendingContinuation(null);
    appendActivity({
      detail: "The Agent accepted the prompt and started working.",
      id: `request-${Date.now()}`,
      label: "Understanding request",
      state: "active",
    });

    try {
      const state = useFlowCanvasStore.getState();
      const preparedTargetNodeId = prepareProductionImageTargetNode(trimmed);
      if (preparedTargetNodeId && requiresProductionExecutor) {
        await flushRemoteDraftBeforeRun();
      }
      const latestState = useFlowCanvasStore.getState();
      const snapshot = buildCanvasAgentSnapshot({
        edges: latestState.edges,
        flowId: latestState.backendFlowId,
        nodeOutputs: latestState.nodeOutputByNodeId,
        nodes: latestState.nodes,
        projectId: latestState.backendProjectId ?? latestState.projectId ?? null,
        viewport: latestState.viewport,
      });

      let resolvedSessionId = sessionId;
      if (!resolvedSessionId) {
        const session = await createAgentSession({
          flowId: state.backendFlowId,
          projectId: state.backendProjectId ?? state.projectId ?? null,
          title: preparedTargetNodeId ? "Canvas Agent Production" : "Canvas Agent",
        });
        resolvedSessionId = session.id;
        setSessionId(session.id);
      }

      const applyPlan = (plan: CanvasAgentPlannerOutput) => {
        setCurrentPlan(plan);
        setMessages((current) => [
          ...current,
          createMessage("assistant", usedOfflineFallback ? `[基础规划模式]\n${plan.reply}` : plan.reply),
        ]);
        setStatus("awaiting_approval");
      };

      if (useStreaming && resolvedSessionId) {
        try {
          const response = await executeAgentTurnStream(resolvedSessionId, {
            continuationContext: activeContinuation,
            prompt: trimmed,
            snapshot,
          });
          if (response.ok) {
            await readAgentToolEventStream(response, applyToolEvent);
            return;
          }
          if (requiresProductionExecutor) {
            throw new Error("真实 Agent 执行器不可用，无法完成生成、对比或套图类生产任务。请先确认服务器已启用 Agent Executor、文本大模型和生图线路。");
          }
          if (response.status !== 404 && response.status !== 503) {
            throw new V2HttpError({
              message: `Request failed with status ${response.status}`,
              status: response.status,
            });
          }
        } catch (executorError) {
          if (requiresProductionExecutor) {
            throw executorError;
          }
        }

        try {
          let receivedPlan = false;
          const response = await openAgentTurnStream(resolvedSessionId, {
            continuationContext: activeContinuation,
            prompt: trimmed,
            snapshot,
          });
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
          if (!allowOfflineFallback && !(streamError instanceof V2HttpError && (streamError.status === 401 || streamError.status === 403))) {
            // fall through to non-stream call
          }
        }
      }

      if (resolvedSessionId) {
        try {
          const plan = await createAgentTurn(resolvedSessionId, {
            continuationContext: activeContinuation,
            prompt: trimmed,
            snapshot,
          });
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
  }, [appendActivity, applyToolEvent, pendingContinuation, sessionId, usedOfflineFallback]);

  const cancelCurrentPlan = useCallback(() => {
    setCurrentPlan(null);
    setStatus("idle");
    setError(null);
  }, []);

  const approveToolCall = useCallback(async (toolCallKey: string, selection?: AgentImageRunSettingsSelection) => {
    const item = toolTimeline.find((candidate) => candidate.toolCallKey === toolCallKey);
    if (!sessionId || !item?.turnId) {
      setError("Agent approval is missing its session or turn reference.");
      return;
    }

    setError(null);
    setStatus("executing_tool");
    setToolTimeline((current) => current.map((candidate) => candidate.toolCallKey === toolCallKey
      ? {
          ...candidate,
          estimate: {
            ...(candidate.estimate ?? {}),
            currentSelection: selection,
          },
        }
      : candidate));
    try {
      const response = await approveAgentToolCallStream(sessionId, {
        settings: selection,
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

  const selectToolAssetRef = useCallback((toolCallKey: string, refId: string) => {
    setToolTimeline((current) =>
      current.map((candidate) =>
        candidate.toolCallKey !== toolCallKey
          ? candidate
          : {
              ...candidate,
              activeAssetRefId: refId,
              selectedAssetRefIds: normalizeSelectedRefIds(candidate, refId),
            },
      ),
    );
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
      activityTimeline,
      approveToolCall,
      cancelCurrentPlan,
      cancelToolCall,
      currentPlan,
      error,
      executeCurrentPlan,
      hydrateReplayEvents,
      lastContinuation,
      messages,
      pendingContinuation,
      placeToolAssetsOnCanvas,
      selectToolAssetRef,
      sendPrompt,
      sessionId,
      setPendingContinuation,
      setSessionId,
      status,
      toolTimeline,
      usedOfflineFallback,
    }),
    [
      activityTimeline,
      approveToolCall,
      cancelCurrentPlan,
      cancelToolCall,
      currentPlan,
      error,
      executeCurrentPlan,
      hydrateReplayEvents,
      lastContinuation,
      messages,
      pendingContinuation,
      placeToolAssetsOnCanvas,
      selectToolAssetRef,
      sendPrompt,
      sessionId,
      setPendingContinuation,
      setSessionId,
      status,
      toolTimeline,
      usedOfflineFallback,
    ],
  );
}
