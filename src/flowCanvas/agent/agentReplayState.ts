import type { AgentSessionEvent } from "./canvasAgentApi";
import type {
  CanvasAgentToolApprovalEstimate,
  CanvasAgentToolAssetRef,
  CanvasAgentToolTimelineItem,
} from "./canvasAgentToolTypes";
import type { CanvasAgentMessage } from "./useCanvasAgentSession";
import type { CanvasAgentActivityItem } from "./CanvasAgentActivityTimeline";
import type { ConversationBlock } from "./conversation/ConversationBlockTypes";

export type V2AgentSessionState = {
  activityTimeline: CanvasAgentActivityItem[];
  error: string | null;
  finalText: string | null;
  pendingApproval: Record<string, unknown> | null;
  pendingQuestion: string | null;
  conversationBlocks: ConversationBlock[];
  status: "awaiting_approval" | "error" | "executing_tool" | "idle" | "waiting_for_input";
  toolTimeline: CanvasAgentToolTimelineItem[];
};

export function createInitialV2AgentSessionState(): V2AgentSessionState {
  return {
    activityTimeline: [],
    error: null,
    finalText: null,
    pendingApproval: null,
    pendingQuestion: null,
    conversationBlocks: [],
    status: "idle",
    toolTimeline: [],
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function getBoundedString(value: unknown, maxLength: number): string | undefined {
  const text = getString(value);
  return text ? text.slice(0, maxLength) : undefined;
}

function getStringList(value: unknown, maxItems = 12): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .map((item) => getBoundedString(item, 200))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
  return values.length > 0 ? values : undefined;
}

function sanitizeV2AssetRefs(value: unknown): CanvasAgentToolAssetRef[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const refs = value
    .map((item) => {
      const ref = asRecord(item);
      const assetId = getBoundedString(ref?.assetId, 200);
      const kind = ref?.kind;
      const label = getBoundedString(ref?.label, 200);
      const promptSummary = typeof ref?.promptSummary === "string" ? ref.promptSummary.slice(0, 1000) : undefined;
      const refId = getBoundedString(ref?.refId, 200);
      if (!assetId || (kind !== "image" && kind !== "video") || !label || promptSummary === undefined || !refId) return null;
      return {
        assetId,
        ...(typeof ref?.height === "number" && Number.isFinite(ref.height) ? { height: ref.height } : {}),
        kind,
        label,
        promptSummary,
        refId,
        ...(typeof ref?.width === "number" && Number.isFinite(ref.width) ? { width: ref.width } : {}),
      } satisfies CanvasAgentToolAssetRef;
    })
    .filter((item): item is CanvasAgentToolAssetRef => item !== null)
    .slice(0, 12);
  return refs.length > 0 ? refs : undefined;
}

function sanitizeV2Runs(value: unknown): Array<Record<string, string>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const runs = value
    .map((item) => {
      const run = asRecord(item);
      const id = getBoundedString(run?.id, 200);
      const status = getBoundedString(run?.status, 80);
      return id && status ? { id, status } : null;
    })
    .filter((item): item is Record<string, string> => item !== null)
    .slice(0, 12);
  return runs.length > 0 ? runs : undefined;
}

function sanitizeV2ToolResult(value: Record<string, unknown>): Record<string, unknown> {
  const estimate = asRecord(value.estimate);
  const output = asRecord(value.output);
  const outputText = getBoundedString(output?.text, 20_000);
  const result = {
    ...(typeof value.allTerminal === "boolean" ? { allTerminal: value.allTerminal } : {}),
    ...(typeof value.approvalRequired === "boolean" ? { approvalRequired: value.approvalRequired } : {}),
    ...(getStringList(value.assetIds) ? { assetIds: getStringList(value.assetIds) } : {}),
    ...(sanitizeV2AssetRefs(value.assetRefs) ? { assetRefs: sanitizeV2AssetRefs(value.assetRefs) } : {}),
    ...(getStringList(value.createdNodeIds) ? { createdNodeIds: getStringList(value.createdNodeIds) } : {}),
    ...(getBoundedString(value.error, 1000) ? { error: getBoundedString(value.error, 1000) } : {}),
    ...(getStringList(value.nodeIds) ? { nodeIds: getStringList(value.nodeIds) } : {}),
    ...(getStringList(value.placedNodeIds) ? { placedNodeIds: getStringList(value.placedNodeIds) } : {}),
    ...(getBoundedString(value.message, 1000) ? { message: getBoundedString(value.message, 1000) } : {}),
    ...(getBoundedString(value.question, 1000) ? { question: getBoundedString(value.question, 1000) } : {}),
    ...(typeof value.revision === "number" && Number.isSafeInteger(value.revision) && value.revision >= 0 ? { revision: value.revision } : {}),
    ...(sanitizeV2Runs(value.runs) ? { runs: sanitizeV2Runs(value.runs) } : {}),
    ...(getBoundedString(value.skillRunId, 200) ? { skillRunId: getBoundedString(value.skillRunId, 200) } : {}),
    ...(getBoundedString(value.skillStepId, 200) ? { skillStepId: getBoundedString(value.skillStepId, 200) } : {}),
    ...(getBoundedString(value.status, 80) ? { status: getBoundedString(value.status, 80) } : {}),
    ...(getBoundedString(value.text, 20_000) ? { text: getBoundedString(value.text, 20_000) } : {}),
    ...(outputText ? { output: { text: outputText } } : {}),
    ...(getStringList(value.updatedNodeIds) ? { updatedNodeIds: getStringList(value.updatedNodeIds) } : {}),
    ...(getBoundedString(value.workflowRunId, 200) ? { workflowRunId: getBoundedString(value.workflowRunId, 200) } : {}),
    ...(typeof estimate?.totalCredits === "number" && Number.isFinite(estimate.totalCredits) ? { estimate: { totalCredits: estimate.totalCredits } } : {}),
  };
  return result;
}

function upsertV2Tool(state: V2AgentSessionState, callId: string, name: string, patch: Partial<CanvasAgentToolTimelineItem>) {
  const existing = state.toolTimeline.find((item) => item.toolCallKey === callId);
  const next: CanvasAgentToolTimelineItem = {
    assetRefs: existing?.assetRefs ?? [],
    status: existing?.status ?? "running",
    title: existing?.title ?? name,
    toolCallKey: callId,
    toolName: name,
    ...existing,
    ...patch,
  };
  state.toolTimeline = [...state.toolTimeline.filter((item) => item.toolCallKey !== callId), next];
}

function appendV2Activity(state: V2AgentSessionState, id: string, label: string, detail: string | undefined, activityState: CanvasAgentActivityItem["state"]) {
  if (state.activityTimeline.some((item) => item.id === id)) return;
  state.activityTimeline = [...state.activityTimeline, { detail, id, label, state: activityState }];
}

export function applyV2AgentEventToSessionState(
  input: V2AgentSessionState,
  eventName: string,
  rawData: unknown,
): V2AgentSessionState {
  const state: V2AgentSessionState = {
    ...input,
    activityTimeline: [...input.activityTimeline],
    toolTimeline: [...input.toolTimeline],
  };
  const data = asRecord(rawData) ?? {};
  const eventType = eventName.replace(/^agent_v2_/, "");
  const callId = getString(data.callId) ?? getString(data.toolCallKey);
  const toolName = getString(data.name) ?? getString(data.toolName) ?? "agent_tool";

  if (eventType === "text_delta") return state;

  if (eventType === "tool_started" && callId) {
    upsertV2Tool(state, callId, toolName, { status: "running" });
    state.status = "executing_tool";
    appendV2Activity(state, `v2-tool-started-${callId}`, `正在执行 ${toolName}`, undefined, "active");
    return state;
  }

  if (eventType === "tool_result" && callId) {
    const result = sanitizeV2ToolResult(asRecord(data.result) ?? {});
    const resultStatus = getString(result.status);
    const waitingForInput = resultStatus === "waiting_for_input" || resultStatus === "awaiting_input";
    const awaitingApproval = resultStatus === "awaiting_approval" || resultStatus === "approval_required" || result.approvalRequired === true;
    const failed = resultStatus === "failed" || resultStatus === "error";
    const partialSuccess = resultStatus === "partial_success";
    upsertV2Tool(state, callId, toolName, {
      ...(Array.isArray(result.assetRefs) ? { assetRefs: result.assetRefs as CanvasAgentToolAssetRef[] } : {}),
      error: failed || partialSuccess ? getString(result.message) ?? getString(result.error) ?? (partialSuccess ? "部分步骤失败，可重试失败步骤。" : "Agent 工具执行失败。") : undefined,
      result,
      status: awaitingApproval ? "awaiting_approval" : failed ? "failed" : partialSuccess ? "partial_success" : "succeeded",
    });
    if (awaitingApproval) {
      state.pendingApproval = { callId, name: toolName, ...result };
      state.status = "awaiting_approval";
      appendV2Activity(state, `v2-approval-${callId}`, "等待确认执行", "确认参数和积分后继续。", "active");
    } else if (waitingForInput) {
      const question = getString(result.question);
      if (question) state.pendingQuestion = question;
      if (question) state.conversationBlocks = [{ type: "question", text: question }];
      state.status = "waiting_for_input";
      appendV2Activity(state, `v2-question-${callId}`, "等待补充信息", question ?? undefined, "active");
    } else {
      appendV2Activity(state, `v2-tool-result-${callId}`, failed ? "执行失败" : "步骤已完成", getString(result.message) ?? undefined, failed ? "failed" : "completed");
    }
    return state;
  }

  if (eventType === "turn_waiting") {
    const reason = getString(data.reason);
    const details = asRecord(data.details);
    if (reason === "user_input") {
      const question = getString(details?.question) ?? getString(data.question);
      if (question) state.pendingQuestion = question;
      if (question) state.conversationBlocks = [{ type: "question", text: question }];
      state.status = "waiting_for_input";
      appendV2Activity(state, `v2-turn-waiting-${question ?? "input"}`, "等待补充信息", question ?? undefined, "active");
    } else {
      state.status = "executing_tool";
      appendV2Activity(state, "v2-turn-waiting-workflow", "正在等待模型返回结果", undefined, "active");
    }
    return state;
  }

  if (eventType === "turn_completed") {
    state.finalText = getString(data.text) ?? getString(data.summary) ?? state.finalText;
    state.pendingQuestion = null;
    state.conversationBlocks = [];
    state.pendingApproval = null;
    state.status = "idle";
    appendV2Activity(state, "v2-turn-completed", "已完成", undefined, "completed");
    return state;
  }

  if (eventType === "turn_failed") {
    state.error = getString(data.message) ?? "Agent 执行失败。";
    state.pendingQuestion = null;
    state.conversationBlocks = [];
    state.pendingApproval = null;
    state.status = "error";
    appendV2Activity(state, "v2-turn-failed", "任务失败", state.error, "failed");
    return state;
  }

  return state;
}

export function buildV2AgentSessionStateFromEvents(events: AgentSessionEvent[]): V2AgentSessionState {
  return events.reduce((state, event) => {
    const payload = event.eventJson;
    const isV2Shape = event.eventType === "turn_waiting"
      || (event.eventType === "tool_started" && typeof payload.callId === "string" && typeof payload.name === "string")
      || (event.eventType === "tool_result" && typeof payload.callId === "string" && typeof payload.name === "string")
      || (event.eventType === "turn_completed" && typeof payload.text === "string")
      || (event.eventType === "turn_failed" && (String(payload.code ?? "").startsWith("AGENT_V2") || payload.graphRevision !== undefined));
    return isV2Shape
      ? applyV2AgentEventToSessionState(state, `agent_v2_${event.eventType}`, payload)
      : state;
  }, createInitialV2AgentSessionState());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asAssetRef(value: unknown): CanvasAgentToolAssetRef | null {
  if (!isRecord(value)) return null;
  if (typeof value.assetId !== "string") return null;
  if (value.kind !== "image" && value.kind !== "video") return null;
  if (typeof value.label !== "string") return null;
  if (typeof value.promptSummary !== "string") return null;
  if (typeof value.refId !== "string") return null;
  return {
    assetId: value.assetId,
    height: typeof value.height === "number" ? value.height : undefined,
    kind: value.kind,
    label: value.label,
    promptSummary: value.promptSummary,
    refId: value.refId,
    width: typeof value.width === "number" ? value.width : undefined,
  };
}

function asEstimate(value: unknown): CanvasAgentToolApprovalEstimate | undefined {
  return isRecord(value) ? (value as CanvasAgentToolApprovalEstimate) : undefined;
}

function getToolTitle(toolName: string) {
  if (toolName === "generate_image_batch") return "批量生图";
  if (toolName === "edit_image") return "图片编辑";
  return "图片生成";
}

function ensureItem(
  items: Map<string, CanvasAgentToolTimelineItem>,
  toolCallKey: string,
  toolName: string,
) {
  const existing = items.get(toolCallKey);
  if (existing) return existing;
  const created: CanvasAgentToolTimelineItem = {
    assetRefs: [],
    status: "running",
    title: getToolTitle(toolName),
    toolCallKey,
    toolName,
  };
  items.set(toolCallKey, created);
  return created;
}

export function buildToolTimelineFromSessionEvents(events: AgentSessionEvent[]): CanvasAgentToolTimelineItem[] {
  const items = new Map<string, CanvasAgentToolTimelineItem>();

  for (const event of events) {
    const payload = event.eventJson;
    if (event.eventType === "tool_started") {
      const toolCallKey = typeof payload.toolCallKey === "string" ? payload.toolCallKey : null;
      const toolName = typeof payload.toolName === "string" ? payload.toolName : "generate_image";
      if (!toolCallKey) continue;
      const current = ensureItem(items, toolCallKey, toolName);
      current.status = current.status === "awaiting_approval" ? current.status : "running";
      current.toolName = toolName;
      current.title = current.title || getToolTitle(toolName);
      continue;
    }

    if (event.eventType === "task_created") {
      const toolCallKey = typeof payload.toolCallKey === "string" ? payload.toolCallKey : null;
      const toolName = typeof payload.toolName === "string" ? payload.toolName : "generate_image";
      if (!toolCallKey) continue;
      const current = ensureItem(items, toolCallKey, toolName);
      current.taskId = typeof payload.taskId === "string" ? payload.taskId : current.taskId;
      current.title =
        typeof payload.title === "string" && payload.title.trim().length > 0 ? payload.title : current.title;
      current.toolName = toolName;
      continue;
    }

    if (event.eventType === "artifact_created") {
      const toolCallKey = typeof payload.toolCallKey === "string" ? payload.toolCallKey : null;
      if (!toolCallKey) continue;
      const current = ensureItem(items, toolCallKey, "generate_image");
      const assetRef = asAssetRef(payload.assetRef);
      if (assetRef && !current.assetRefs.some((item) => item.refId === assetRef.refId)) {
        current.assetRefs = [...current.assetRefs, assetRef];
      }
      current.taskId = typeof payload.taskId === "string" ? payload.taskId : current.taskId;
      continue;
    }

    if (event.eventType === "task_completed") {
      const toolCallKey = typeof payload.toolCallKey === "string" ? payload.toolCallKey : null;
      if (!toolCallKey) continue;
      const current = ensureItem(items, toolCallKey, "generate_image");
      current.status = "succeeded";
      current.taskId = typeof payload.taskId === "string" ? payload.taskId : current.taskId;
      current.result = isRecord(payload.result) ? payload.result : current.result;
      continue;
    }

    if (event.eventType === "task_failed") {
      const toolCallKey = typeof payload.toolCallKey === "string" ? payload.toolCallKey : null;
      if (!toolCallKey) continue;
      const current = ensureItem(items, toolCallKey, "generate_image");
      current.error = typeof payload.message === "string" ? payload.message : "Agent 任务失败。";
      current.status = "failed";
      current.taskId = typeof payload.taskId === "string" ? payload.taskId : current.taskId;
      continue;
    }

    if (event.eventType === "approval_required") {
      const toolCallKey = typeof payload.toolCallKey === "string" ? payload.toolCallKey : null;
      if (!toolCallKey) continue;
      const current = ensureItem(items, toolCallKey, "generate_image");
      current.status = "awaiting_approval";
      current.estimate = asEstimate(payload.estimate);
      current.turnId = typeof payload.turnId === "string" ? payload.turnId : current.turnId;
      continue;
    }

    if (event.eventType === "tool_result") {
      const toolCallKey = typeof payload.toolCallKey === "string" ? payload.toolCallKey : null;
      if (!toolCallKey) continue;
      const current = ensureItem(items, toolCallKey, "generate_image");
      const result = isRecord(payload.result) ? payload.result : {};
      const status = result.status === "failed"
        ? "failed"
        : result.status === "partial_success"
          ? "partial_success"
          : "succeeded";
      const assetRefs = Array.isArray(result.assetRefs)
        ? result.assetRefs
            .map((value) => asAssetRef(value))
            .filter((value): value is CanvasAgentToolAssetRef => value !== null)
        : [];
      current.assetRefs = assetRefs.length > 0 ? assetRefs : current.assetRefs;
      current.result = result;
      current.status = status;
      current.taskId = typeof result.toolCallId === "string" ? result.toolCallId : current.taskId;
      continue;
    }

    if (event.eventType === "turn_failed") {
      const turnId = typeof payload.turnId === "string" ? payload.turnId : event.turnId;
      for (const item of items.values()) {
        if (!turnId || item.turnId === turnId || item.status === "running") {
          item.error = typeof payload.message === "string" ? payload.message : item.error;
          item.status = "failed";
        }
      }
    }
  }

  return Array.from(items.values());
}

export function deriveReplaySessionStatus(events: AgentSessionEvent[]): {
  error: string | null;
  status: "awaiting_approval" | "error" | "executing_tool" | "idle";
  workspaceState: "awaiting_credit_confirm" | "failed" | "replay" | "running_workflow";
} {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    const payload = event.eventJson;

    if (event.eventType === "turn_failed") {
      return {
        error: typeof payload.message === "string" ? payload.message : "Agent 执行失败。",
        status: "error",
        workspaceState: "failed",
      };
    }

    if (event.eventType === "task_failed") {
      return {
        error: typeof payload.message === "string" ? payload.message : "Agent 任务失败。",
        status: "error",
        workspaceState: "failed",
      };
    }

    if (event.eventType === "approval_required") {
      return {
        error: null,
        status: "awaiting_approval",
        workspaceState: "awaiting_credit_confirm",
      };
    }

    if (
      event.eventType === "tool_started" ||
      event.eventType === "task_created" ||
      event.eventType === "workflow_run_linked" ||
      event.eventType === "artifact_created" ||
      event.eventType === "tool_progress"
    ) {
      return {
        error: null,
        status: "executing_tool",
        workspaceState: "running_workflow",
      };
    }

    if (event.eventType === "turn_completed" || event.eventType === "tool_result" || event.eventType === "task_completed") {
      return {
        error: null,
        status: "idle",
        workspaceState: "replay",
      };
    }
  }

  return {
    error: null,
    status: "idle",
    workspaceState: "replay",
  };
}

export function buildReplayMessages(messages: CanvasAgentMessage[], events: AgentSessionEvent[]): CanvasAgentMessage[] {
  const next = [...messages];
  for (const event of events) {
    if (event.eventType === "turn_failed") {
      const message = typeof event.eventJson.message === "string" ? event.eventJson.message : "";
      if (!message) continue;
      const id = `replay-error-${event.id}`;
      if (next.some((item) => item.id === id)) continue;
      next.push({
        content: message,
        id,
        role: "system",
      });
    }
  }
  return next;
}
