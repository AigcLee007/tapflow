import type {
  AgentWorkspaceTimelineItem,
  BuildAgentWorkspaceTimelineInput,
} from "./CanvasAgentWorkspaceTypes";

function userFacingStatus(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (
    normalized.includes("workflow") ||
    normalized.includes("model result") ||
    normalized.includes("waiting for model")
  ) {
    return "正在等待模型返回结果";
  }
  if (normalized.includes("generation") || normalized.includes("submitting")) {
    return "正在提交生成任务";
  }
  if (normalized.includes("saving") || normalized.includes("result")) {
    return "正在保存到素材库";
  }
  if (normalized.includes("canvas")) {
    return "正在放入画布";
  }
  if (normalized.includes("approval")) {
    return "等待你确认模型和积分";
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
  if (status === "running") return "Agent 正在执行这一生产步骤。";
  if (status === "succeeded") return "这一生产步骤已经完成。";
  if (status === "failed") return "这一生产步骤失败了，可以调整参数后重试。";
  if (status === "awaiting_approval") return "执行前需要你确认模型、参数和积分。";
  return "Agent 已经准备好这一生产步骤。";
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

    if (tool.status === "succeeded" && tool.assetRefs.length > 0) {
      items.push({
        assets: tool.assetRefs,
        id: `result-${tool.toolCallKey}`,
        kind: "result",
        placedNodeIds: tool.placedNodeIds,
        toolCallKey: tool.toolCallKey,
      });
      continue;
    }

    items.push({
      id: `tool-${tool.toolCallKey}`,
      kind: "tool",
      status: tool.status,
      summary: tool.error ?? toolSummary(tool.status),
      title: tool.title || "生产任务",
      toolCallKey: tool.toolCallKey,
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
