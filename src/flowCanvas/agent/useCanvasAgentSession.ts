import { useCallback, useMemo, useState } from "react";

import { V2HttpError } from "../../services/v2HttpClient";
import { flushRemoteDraftBeforeRun } from "../runtime/remoteDraftSaveBarrier";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { buildCanvasAgentSnapshot } from "./canvasAgentSnapshot";
import {
  approveAgentToolCallStream,
  createAgentSession,
  createAgentTurn,
  executeAgentTurnStream,
  getAgentImageRunSettings,
  openAgentTurnStream,
  openAgentV2TurnStream,
  readAgentSseStream,
  type AgentContinuationContext,
  type AgentSessionEvent,
} from "./canvasAgentApi";
import type { AgentReferenceContext } from "./agentReferenceContext";
import type { CanvasAgentActivityItem } from "./CanvasAgentActivityTimeline";
import { buildReplayMessages, buildToolTimelineFromSessionEvents, deriveReplaySessionStatus } from "./agentReplayState";
import type { AgentImageRunSettingsSelection } from "./agentRunSettings";
import { placeAgentGeneratedAssetsOnCanvas } from "./canvasAgentOps";
import { isProductionImageAgentPrompt } from "./canvasAgentProductionIntent";
import {
  reduceCanvasAgentWorkspaceState,
  type CanvasAgentWorkspaceEvent,
  type CanvasAgentWorkspaceState,
} from "./canvasAgentStateMachine";
import { readAgentToolEventStream } from "./canvasAgentToolEvents";
import type {
  CanvasAgentContinuationAction,
  CanvasAgentToolEvent,
  CanvasAgentToolTimelineItem,
} from "./canvasAgentToolTypes";
import type { CanvasAgentPlannerOutput } from "./canvasAgentTypes";
import { planOfflineCanvasAgentTurn } from "./offlineCanvasAgentPlanner";

export type CanvasAgentMessage = {
  content: string;
  id: string;
  metadata?: Record<string, unknown>;
  role: "assistant" | "system" | "user";
};

type PendingContinuation = AgentContinuationContext;

type UseCanvasAgentSessionOptions = {
  onServerDraftApplied?: () => void | Promise<void>;
};

type SendPromptOptions = {
  referenceContext?: AgentReferenceContext;
  selectedSkillId?: string | null;
};

type ApplyResult = {
  createdNodeIds: string[];
  errors: Array<{ message: string }>;
  ok: boolean;
  ranNodeIds: string[];
};

type SessionStatus = "awaiting_approval" | "error" | "executing" | "executing_tool" | "idle" | "thinking";

const DEFAULT_AGENT_IMAGE_ROUTE_KEY = "image.default";

function getToolTitle(toolName: string) {
  if (toolName === "generate_image_batch") return "批量生图";
  if (toolName === "edit_image") return "图片编辑";
  return "图片生成";
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
  return "生成对比图";
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

function buildAgentSessionTitle(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "TapFlow Agent";
  return normalized.length > 36 ? `${normalized.slice(0, 36)}...` : normalized;
}

function getWorkspaceStatus(state: CanvasAgentWorkspaceState): SessionStatus {
  if (state === "failed") return "error";
  if (state === "reading_context" || state === "thinking") return "thinking";
  if (state === "applying_canvas_ops") return "executing";
  if (state === "running_workflow") return "executing_tool";
  if (state === "plan_ready" || state === "awaiting_canvas_confirm" || state === "awaiting_credit_confirm") {
    return "awaiting_approval";
  }
  return "idle";
}

export function useCanvasAgentSession(options: UseCanvasAgentSessionOptions = {}) {
  const [messages, setMessages] = useState<CanvasAgentMessage[]>([]);
  const [currentPlan, setCurrentPlan] = useState<CanvasAgentPlannerOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [workspaceState, setWorkspaceState] = useState<CanvasAgentWorkspaceState>("idle");
  const [toolTimeline, setToolTimeline] = useState<CanvasAgentToolTimelineItem[]>([]);
  const [usedOfflineFallback, setUsedOfflineFallback] = useState(false);
  const [activityTimeline, setActivityTimeline] = useState<CanvasAgentActivityItem[]>([]);
  const [pendingContinuation, setPendingContinuation] = useState<PendingContinuation | null>(null);
  const [lastContinuation, setLastContinuation] = useState<PendingContinuation | null>(null);

  const appendActivity = useCallback((item: CanvasAgentActivityItem) => {
    setActivityTimeline((current) => [...current, item]);
  }, []);

  const transitionWorkspaceState = useCallback((event: CanvasAgentWorkspaceEvent) => {
    setWorkspaceState((current) => reduceCanvasAgentWorkspaceState(current, event));
  }, []);

  const clearContinuation = useCallback(() => {
    setPendingContinuation(null);
    setLastContinuation(null);
  }, []);

  const resetSession = useCallback(() => {
    setActivityTimeline([]);
    setCurrentPlan(null);
    setError(null);
    setLastContinuation(null);
    setMessages([]);
    setPendingContinuation(null);
    setSessionId(null);
    setToolTimeline([]);
    setUsedOfflineFallback(false);
    setWorkspaceState("idle");
  }, []);

  const failSession = useCallback((message: string) => {
    setError(message);
    setMessages((current) => [...current, createMessage("system", message)]);
    setWorkspaceState("failed");
  }, []);

  const onServerDraftApplied = options.onServerDraftApplied;

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
      transitionWorkspaceState({ type: "workflow_started" });
      appendActivity({
        detail: "Agent 已创建执行任务并开始运行。",
        id: `tool-start-${event.toolCallKey}`,
        label: "正在提交生成任务",
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
      setToolTimeline((current) =>
        current.map((item) =>
          item.toolCallKey === event.toolCallKey
            ? {
                ...item,
                taskId: event.taskId,
                title: event.title || item.title,
                toolName: event.toolName || item.toolName,
              }
            : item,
        ),
      );
      return;
    }

    if (event.type === "workflow_run_linked") {
      appendActivity({
        detail: `工作流 ${event.workflowRunId} 已关联到当前 Agent 步骤。`,
        id: `workflow-${event.toolCallKey}-${event.workflowRunId}`,
        label: "正在等待模型返回结果",
        state: "active",
      });
      return;
    }

    if (event.type === "artifact_created") {
      setToolTimeline((current) =>
        current.map((item) => {
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
        }),
      );
      return;
    }

    if (event.type === "task_completed") {
      setToolTimeline((current) =>
        current.map((item) =>
          item.toolCallKey === event.toolCallKey
            ? {
                ...item,
                result: event.result ?? item.result,
                status: "succeeded",
                taskId: event.taskId || item.taskId,
              }
            : item,
        ),
      );
      return;
    }

    if (event.type === "task_failed") {
      setToolTimeline((current) =>
        current.map((item) =>
          item.toolCallKey === event.toolCallKey
            ? {
                ...item,
                error: event.message,
                status: "failed",
                taskId: event.taskId || item.taskId,
              }
            : item,
        ),
      );
      appendActivity({
        detail: event.message,
        id: `task-failed-${event.taskId}`,
        label: "生成失败",
        state: "failed",
      });
      return;
    }

    if (event.type === "approval_required") {
      transitionWorkspaceState({ type: "credit_approval_required" });
      appendActivity({
        detail: "执行付费生成前需要你确认参数与积分。",
        id: `approval-${event.toolCallKey}`,
        label: "等待确认参数和积分",
        state: "active",
      });
      setToolTimeline((current) =>
        current.map((item) =>
          item.toolCallKey === event.toolCallKey
            ? { ...item, estimate: event.estimate, status: "awaiting_approval", turnId: event.turnId }
            : item,
        ),
      );
      void getAgentImageRunSettings()
        .then((response) => {
          setToolTimeline((current) =>
            current.map((item) =>
              item.toolCallKey === event.toolCallKey
                ? {
                    ...item,
                    estimate: {
                      ...(item.estimate ?? {}),
                      ...(event.estimate ?? {}),
                      imageRunSettings: response.models,
                    },
                  }
                : item,
            ),
          );
        })
        .catch(() => {});
      return;
    }

    if (event.type === "tool_result") {
      const result = event.result && typeof event.result === "object" ? (event.result as Record<string, unknown>) : {};
      const assetRefs = Array.isArray(result.assetRefs) ? (result.assetRefs as CanvasAgentToolTimelineItem["assetRefs"]) : [];
      const failed = result.status === "failed";

      appendActivity({
        detail: failed ? "上游生成步骤没有返回可用结果。" : "结果已返回，正在保存并准备放入画布。",
        id: `result-${event.toolCallKey}`,
        label: failed ? "生成失败" : "正在保存到素材库",
        state: failed ? "failed" : "completed",
      });

      setToolTimeline((current) =>
        current.map((item) => {
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
        }),
      );

      if (!failed && assetRefs.length > 0) {
        transitionWorkspaceState({ type: "asset_created" });
      }
      return;
    }

    if (event.type === "canvas_op_applied") {
      transitionWorkspaceState({
        hasRunOps: (event.runNodeIds?.length ?? 0) > 0,
        type: "canvas_ops_applied",
      });
      appendActivity({
        detail: `已创建 ${event.createdNodeIds.length} 个节点，更新 ${event.updatedNodeIds.length} 个节点。`,
        id: `canvas-op-${event.turnId ?? Date.now()}`,
        label: "正在放入画布",
        state: "completed",
      });
      const state = useFlowCanvasStore.getState();
      const highlightedIds = [...event.createdNodeIds, ...event.updatedNodeIds];
      if (highlightedIds.length > 0) {
        state.selectNodesByIds(highlightedIds);
      }
      void onServerDraftApplied?.();
      return;
    }

    if (event.type === "turn_completed") {
      if (event.finalText.trim()) {
        setMessages((current) => [...current, createMessage("assistant", event.finalText)]);
      }
      appendActivity({
        detail: "这一轮 Agent 任务已完成。",
        id: `turn-complete-${event.turnId}`,
        label: "已完成",
        state: "completed",
      });
      transitionWorkspaceState({ type: "turn_completed" });
      return;
    }

    if (event.type === "turn_failed") {
      appendActivity({
        detail: event.message,
        id: `turn-failed-${event.turnId ?? Date.now()}`,
        label: "执行失败",
        state: "failed",
      });
      failSession(event.message);
    }
  }, [appendActivity, failSession, onServerDraftApplied, sessionId, transitionWorkspaceState]);

  const hydrateReplayEvents = useCallback((events: AgentSessionEvent[]) => {
    setToolTimeline(buildToolTimelineFromSessionEvents(events));
    const replayState = deriveReplaySessionStatus(events);
    setWorkspaceState(replayState.workspaceState);
    setError(replayState.error);
    setMessages((current) => buildReplayMessages(current, events));
  }, []);

  const sendPrompt = useCallback(async (prompt: string, options?: SendPromptOptions) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const allowOfflineFallback = import.meta.env.VITE_AGENT_OFFLINE_FALLBACK === "true";
    const requiresProductionExecutor = isProductionImageAgentPrompt(trimmed);
    const useStreaming = import.meta.env.VITE_AGENT_STREAMING !== "false";

    setError(null);
    setUsedOfflineFallback(false);
    setToolTimeline([]);
    setActivityTimeline([]);
    setWorkspaceState("reading_context");

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
      detail: "Agent 已接收你的任务并开始处理。",
      id: `request-${Date.now()}`,
      label: "正在读取当前画布和选区",
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

      transitionWorkspaceState({ type: "context_ready" });
      appendActivity({
        detail: "正在整理选中节点、上游依赖和当前画布结构。",
        id: `planning-${Date.now()}`,
        label: "正在规划可编辑流程",
        state: "active",
      });

      let resolvedSessionId = sessionId;
      if (!resolvedSessionId) {
        const session = await createAgentSession({
          flowId: state.backendFlowId,
          projectId: state.backendProjectId ?? state.projectId ?? null,
          title: buildAgentSessionTitle(trimmed),
        });
        resolvedSessionId = session.id;
        setSessionId(session.id);
      }

      const applyPlan = (plan: CanvasAgentPlannerOutput) => {
        const hasRunOps = plan.proposedOps.some((op) => op.type === "run_node");
        setCurrentPlan(plan);
        setMessages((current) => [
          ...current,
          createMessage("assistant", usedOfflineFallback ? `[基础规划模式]\n${plan.reply}` : plan.reply),
        ]);
        setWorkspaceState(hasRunOps ? "awaiting_canvas_confirm" : "plan_ready");
      };

      if (useStreaming && resolvedSessionId) {
        try {
          const response = await executeAgentTurnStream(resolvedSessionId, {
            continuationContext: activeContinuation,
            prompt: trimmed,
            referenceContext: options?.referenceContext,
            selectedSkillId: options?.selectedSkillId,
            snapshot,
          });
          if (response.ok) {
            await readAgentToolEventStream(response, applyToolEvent);
            return;
          }
          if (requiresProductionExecutor) {
            throw new Error("真实 Agent 执行器不可用，无法完成生图、对比或套图类生产任务。请先确认服务器已启用 Agent Executor、文本模型和生图线路。");
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
          const streamOpener = import.meta.env.VITE_AGENT_V2_ENABLED === "true" ? openAgentV2TurnStream : openAgentTurnStream;
          const response = await streamOpener(resolvedSessionId, {
            continuationContext: activeContinuation,
            prompt: trimmed,
            referenceContext: options?.referenceContext,
            selectedSkillId: options?.selectedSkillId,
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
              throw new Error(
                typeof data === "object" && data && "message" in (data as Record<string, unknown>)
                  ? String((data as Record<string, unknown>).message)
                  : "Agent 规划流失败。",
              );
            },
            onPlan: (data) => {
              receivedPlan = true;
              applyPlan(data as CanvasAgentPlannerOutput);
            },
            onAgentV2: (eventName, data) => {
              receivedPlan = true;
              if (eventName === "agent_v2_text_delta" && typeof data === "object" && data && "text" in data) {
                const text = String((data as { text: unknown }).text);
                setMessages((current) => [...current, createMessage("assistant", text)]);
              }
              if (eventName === "agent_v2_turn_completed" && typeof data === "object" && data && "text" in data) {
                setMessages((current) => [...current, createMessage("assistant", String((data as { text: unknown }).text))]);
                transitionWorkspaceState({ type: "turn_completed" });
              }
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
            referenceContext: options?.referenceContext,
            selectedSkillId: options?.selectedSkillId,
            snapshot,
          });
          applyPlan(plan);
          return;
        } catch (apiError) {
          if (apiError instanceof V2HttpError && (apiError.status === 401 || apiError.status === 403)) {
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
      failSession(message);
    }
  }, [appendActivity, applyToolEvent, failSession, pendingContinuation, sessionId, transitionWorkspaceState, usedOfflineFallback]);

  const cancelCurrentPlan = useCallback(() => {
    setCurrentPlan(null);
    setWorkspaceState("idle");
    setError(null);
  }, []);

  const approveToolCall = useCallback(async (toolCallKey: string, selection?: AgentImageRunSettingsSelection) => {
    const item = toolTimeline.find((candidate) => candidate.toolCallKey === toolCallKey);
    if (!sessionId || !item?.turnId) {
      setError("Agent 缺少会话或 turn 引用，无法继续确认。");
      return;
    }

    setError(null);
    transitionWorkspaceState({ type: "credit_approved" });
    setToolTimeline((current) =>
      current.map((candidate) =>
        candidate.toolCallKey === toolCallKey
          ? {
              ...candidate,
              estimate: {
                ...(candidate.estimate ?? {}),
                currentSelection: selection,
              },
            }
          : candidate,
      ),
    );

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
      setToolTimeline((current) =>
        current.map((candidate) =>
          candidate.toolCallKey === toolCallKey ? { ...candidate, error: message, status: "failed" } : candidate,
        ),
      );
      failSession(message);
    }
  }, [applyToolEvent, failSession, sessionId, toolTimeline, transitionWorkspaceState]);

  const cancelToolCall = useCallback((toolCallKey: string) => {
    setToolTimeline((current) =>
      current.map((item) =>
        item.toolCallKey === toolCallKey ? { ...item, error: "已取消", status: "failed" } : item,
      ),
    );
    setWorkspaceState("idle");
    setMessages((current) => [...current, createMessage("assistant", "已取消，本次 Agent 工具未消耗积分。")]);
  }, []);

  const placeToolAssetsOnCanvas = useCallback((toolCallKey: string) => {
    const item = toolTimeline.find((candidate) => candidate.toolCallKey === toolCallKey);
    if (!item || item.assetRefs.length === 0) return;
    const placed = placeAgentGeneratedAssetsOnCanvas({
      assets: item.assetRefs,
      sessionId,
      toolCallId:
        typeof (item.result as { toolCallId?: unknown } | null)?.toolCallId === "string"
          ? (item.result as { toolCallId: string }).toolCallId
          : toolCallKey,
      turnId: item.turnId ?? null,
    });
    setToolTimeline((current) =>
      current.map((candidate) =>
        candidate.toolCallKey === toolCallKey ? { ...candidate, placedNodeIds: placed.createdNodeIds } : candidate,
      ),
    );
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
      transitionWorkspaceState({ type: "canvas_confirmed" });
      appendActivity({
        detail: "Agent 正在把确认后的节点和连线写入画布。",
        id: `apply-${Date.now()}`,
        label: "正在写入服务端画布草稿",
        state: "active",
      });

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

        setWorkspaceState(result.ranNodeIds.length > 0 ? "running_workflow" : "idle");

        const fragments: string[] = [];
        if (result.createdNodeIds.length > 0) fragments.push(`创建了 ${result.createdNodeIds.length} 个节点`);
        if (result.ranNodeIds.length > 0) fragments.push(`启动了 ${result.ranNodeIds.length} 个生成任务`);
        setMessages((current) => [
          ...current,
          createMessage("assistant", fragments.length > 0 ? `计划已执行：${fragments.join("，")}。` : "计划已执行。"),
        ]);
        setCurrentPlan(null);
      } catch (executionError) {
        const message = executionError instanceof Error ? executionError.message : String(executionError);
        failSession(`执行失败：${message}`);
      }
    },
    [appendActivity, currentPlan, failSession, transitionWorkspaceState],
  );

  const status = useMemo(() => getWorkspaceStatus(workspaceState), [workspaceState]);

  return useMemo(
    () => ({
      activityTimeline,
      approveToolCall,
      cancelCurrentPlan,
      cancelToolCall,
      clearContinuation,
      currentPlan,
      error,
      executeCurrentPlan,
      hydrateReplayEvents,
      lastContinuation,
      messages,
      pendingContinuation,
      placeToolAssetsOnCanvas,
      resetSession,
      selectToolAssetRef,
      sendPrompt,
      sessionId,
      setPendingContinuation,
      setSessionId,
      status,
      toolTimeline,
      usedOfflineFallback,
      workspaceState,
    }),
    [
      activityTimeline,
      approveToolCall,
      cancelCurrentPlan,
      cancelToolCall,
      clearContinuation,
      currentPlan,
      error,
      executeCurrentPlan,
      hydrateReplayEvents,
      lastContinuation,
      messages,
      pendingContinuation,
      placeToolAssetsOnCanvas,
      resetSession,
      selectToolAssetRef,
      sendPrompt,
      sessionId,
      setPendingContinuation,
      setSessionId,
      status,
      toolTimeline,
      usedOfflineFallback,
      workspaceState,
    ],
  );
}
