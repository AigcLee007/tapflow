import type {
  AgentWorkspaceTimelineItem,
  BuildAgentWorkspaceTimelineInput,
} from "./CanvasAgentWorkspaceTypes";

function userFacingStatus(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("skill.load") || normalized === "read skill" || normalized.includes("reading skill")) {
    return "读取 Skill";
  }
  if (normalized.includes("canvas.get_context") || normalized === "understanding canvas" || normalized.includes("read canvas context")) {
    return "理解画布";
  }
  if (normalized === "ask_user" || normalized.includes("supplement") || normalized.includes("missing input") || normalized.includes("补充信息")) {
    return "补充信息";
  }
  if (normalized === "plan_ready" || normalized === "planning" || normalized.includes("制定计划") || normalized.includes("make plan")) {
    return "制定计划";
  }
  if (normalized.includes("waiting_for_approval") || normalized === "waiting for approval" || normalized.includes("等待确认")) {
    return "等待确认";
  }
  if (normalized.includes("submitting generation") || normalized === "submit generation" || normalized.includes("提交生成")) {
    return "提交生成";
  }
  if (normalized.includes("review results") || normalized === "review" || normalized.includes("检查结果")) {
    return "检查结果";
  }
  if (normalized.includes("canvas.apply_ops") || normalized.includes("writeback") || normalized.includes("write back") || normalized.includes("回填画布")) {
    return "回填画布";
  }
  if (
    normalized.includes("workflow") ||
    normalized.includes("model result") ||
    normalized.includes("waiting for model")
  ) {
    return "正在等待模型结果";
  }
  if (normalized.includes("generation") || normalized.includes("submitting")) {
    return "正在提交生成任务";
  }
  if (normalized.includes("saving") || normalized.includes("result")) {
    return "正在保存到素材库";
  }
  if (normalized.includes("canvas")) {
    return "正在更新画布";
  }
  if (normalized.includes("approval")) {
    return "等待确认模型和积分";
  }
  if (normalized.includes("complete")) {
    return "已完成";
  }
  if (normalized.includes("fail")) {
    return "任务失败";
  }
  return "正在理解需求";
}

function toolSummary(status: string) {
  if (status === "running") return "Agent 正在执行这一步。";
  if (status === "succeeded") return "这一步已完成。";
  if (status === "partial_success") return "部分步骤完成，失败步骤可以重试。";
  if (status === "failed") return "这一步失败了，可以调整后重试。";
  if (status === "awaiting_approval") return "执行前需要确认模型、参数和积分。";
  return "Agent 已准备好这一步。";
}

function getTextOutput(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const value = result as { text?: unknown; output?: { text?: unknown } };
  const text = typeof value.text === "string" ? value.text : typeof value.output?.text === "string" ? value.output.text : undefined;
  return text?.trim().slice(0, 20_000) || undefined;
}

export function buildAgentWorkspaceTimeline(
  input: BuildAgentWorkspaceTimelineInput,
): AgentWorkspaceTimelineItem[] {
  const items: AgentWorkspaceTimelineItem[] = [];

  for (const message of input.messages) {
    items.push({
      content: message.content,
      createdAt: typeof message.metadata?.createdAt === "string" ? message.metadata.createdAt : undefined,
      id: `message-${message.id}`,
      kind: "message",
      role: message.role,
    });
  }

  for (const activity of input.activityItems) {
    items.push({
      detail: activity.detail && activity.detail !== activity.label ? activity.detail : undefined,
      id: `status-${activity.id}`,
      kind: "status",
      state: activity.state,
      title: userFacingStatus(activity.label),
    });
  }

  if (
    input.currentPlanOps &&
    input.currentPlanOps.length > 0 &&
    (input.workspaceState === "plan_ready" || input.workspaceState === "awaiting_canvas_confirm")
  ) {
    items.push({
      id: "canvas-ops-pending",
      kind: "canvas_ops",
      ops: input.currentPlanOps,
    });
  }

  for (const tool of input.toolItems) {
    if (tool.status === "awaiting_approval" && tool.estimate?.imageRunSettings?.length) {
      items.push({
        id: `parameter-${tool.toolCallKey}`,
        kind: "parameter",
        models: tool.estimate.imageRunSettings,
        referenceRefs: tool.estimate.referenceRefs,
        toolCallKey: tool.toolCallKey,
      });
      continue;
    }

    if ((tool.status === "succeeded" || tool.status === "partial_success") && tool.assetRefs.length > 0) {
      items.push({
        assets: tool.assetRefs,
        id: `result-${tool.toolCallKey}`,
        kind: "result",
        placedNodeIds: tool.placedNodeIds,
        toolCallKey: tool.toolCallKey,
        workflowRunId: typeof (tool.result as { workflowRunId?: unknown } | undefined)?.workflowRunId === "string"
          ? String((tool.result as { workflowRunId: string }).workflowRunId)
          : undefined,
        status: tool.status,
        retryable: tool.status === "partial_success",
      });
      continue;
    }

    items.push({
      id: `tool-${tool.toolCallKey}`,
      kind: "tool",
      retryable: tool.status === "failed" || tool.status === "partial_success",
      status: tool.status,
      summary: tool.error ?? toolSummary(tool.status),
      textOutput: getTextOutput(tool.result),
      title: tool.title || "生产任务",
      toolCallKey: tool.toolCallKey,
      workflowRunId: typeof (tool.result as { workflowRunId?: unknown } | undefined)?.workflowRunId === "string"
        ? String((tool.result as { workflowRunId: string }).workflowRunId)
        : undefined,
    });
  }

  if (input.error) {
    items.push({
      id: "agent-error",
      kind: "error",
      message: input.error,
      retryable: true,
      title: "Agent 执行失败",
    });
  }

  return items;
}
