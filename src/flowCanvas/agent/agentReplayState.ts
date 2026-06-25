import type { AgentSessionEvent } from "./canvasAgentApi";
import type {
  CanvasAgentToolApprovalEstimate,
  CanvasAgentToolAssetRef,
  CanvasAgentToolTimelineItem,
} from "./canvasAgentToolTypes";
import type { CanvasAgentMessage } from "./useCanvasAgentSession";

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
  return isRecord(value) ? value as CanvasAgentToolApprovalEstimate : undefined;
}

function getToolTitle(toolName: string) {
  if (toolName === "generate_image_batch") return "Batch image generation";
  if (toolName === "edit_image") return "Image edit";
  return "Image generation";
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
      current.title = typeof payload.title === "string" && payload.title.trim().length > 0
        ? payload.title
        : current.title;
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
      current.error = typeof payload.message === "string" ? payload.message : "Agent task failed.";
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
      const status = result.status === "failed" ? "failed" : "succeeded";
      const assetRefs = Array.isArray(result.assetRefs)
        ? result.assetRefs.map((value) => asAssetRef(value)).filter((value): value is CanvasAgentToolAssetRef => value !== null)
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
} {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    const payload = event.eventJson;

    if (event.eventType === "turn_failed") {
      return {
        error: typeof payload.message === "string" ? payload.message : "Agent execution failed.",
        status: "error",
      };
    }

    if (event.eventType === "task_failed") {
      return {
        error: typeof payload.message === "string" ? payload.message : "Agent task failed.",
        status: "error",
      };
    }

    if (event.eventType === "approval_required") {
      return {
        error: null,
        status: "awaiting_approval",
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
      };
    }

    if (event.eventType === "turn_completed" || event.eventType === "tool_result" || event.eventType === "task_completed") {
      return {
        error: null,
        status: "idle",
      };
    }
  }

  return {
    error: null,
    status: "idle",
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
