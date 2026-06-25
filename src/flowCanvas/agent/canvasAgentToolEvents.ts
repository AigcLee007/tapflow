import type { CanvasAgentToolEvent } from "./canvasAgentToolTypes";

function parseEventChunk(chunk: string): CanvasAgentToolEvent | null {
  const event = chunk.match(/^event: (.+)$/m)?.[1]?.trim();
  const dataLine = chunk.match(/^data: (.+)$/m)?.[1];
  if (!event) return null;

  try {
    const data = dataLine ? JSON.parse(dataLine) : {};
    return normalizeAgentToolEvent(event, data);
  } catch (error) {
    return {
      code: "AGENT_EVENT_PARSE_FAILED",
      message: error instanceof Error ? error.message : String(error),
      type: "turn_failed",
    };
  }
}

export function normalizeAgentToolEvent(event: string, data: unknown): CanvasAgentToolEvent {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  if (event === "thinking_status") {
    return {
      detail: typeof record.detail === "string" ? record.detail : undefined,
      label: String(record.label ?? ""),
      type: "thinking_status",
    };
  }
  if (event === "message_delta") {
    return { content: String(record.content ?? ""), type: "message_delta" };
  }
  if (event === "tool_started") {
    return {
      toolCallKey: String(record.toolCallKey ?? ""),
      toolName: String(record.toolName ?? ""),
      type: "tool_started",
    };
  }
  if (event === "task_created") {
    return {
      taskId: String(record.taskId ?? ""),
      title: String(record.title ?? ""),
      toolCallKey: String(record.toolCallKey ?? ""),
      toolName: String(record.toolName ?? ""),
      type: "task_created",
    };
  }
  if (event === "task_completed") {
    return {
      result: record.result,
      taskId: String(record.taskId ?? ""),
      toolCallKey: String(record.toolCallKey ?? ""),
      type: "task_completed",
    };
  }
  if (event === "task_failed") {
    return {
      code: String(record.code ?? "AGENT_TASK_FAILED"),
      message: String(record.message ?? "Agent task failed."),
      taskId: String(record.taskId ?? ""),
      toolCallKey: String(record.toolCallKey ?? ""),
      type: "task_failed",
    };
  }
  if (event === "workflow_run_linked") {
    return {
      nodeRunId: typeof record.nodeRunId === "string" ? record.nodeRunId : undefined,
      toolCallKey: String(record.toolCallKey ?? ""),
      type: "workflow_run_linked",
      workflowRunId: String(record.workflowRunId ?? ""),
    };
  }
  if (event === "artifact_created") {
    return {
      assetRef: record.assetRef as CanvasAgentToolEvent["assetRef"],
      taskId: String(record.taskId ?? ""),
      toolCallKey: String(record.toolCallKey ?? ""),
      type: "artifact_created",
    };
  }
  if (event === "tool_progress") {
    return {
      message: String(record.message ?? ""),
      toolCallKey: String(record.toolCallKey ?? ""),
      type: "tool_progress",
    };
  }
  if (event === "tool_result") {
    return {
      result: record.result,
      toolCallKey: String(record.toolCallKey ?? ""),
      type: "tool_result",
    };
  }
  if (event === "approval_required") {
    return {
      estimate: record.estimate,
      toolCallKey: String(record.toolCallKey ?? ""),
      turnId: String(record.turnId ?? ""),
      type: "approval_required",
    };
  }
  if (event === "turn_completed") {
    return {
      finalText: String(record.finalText ?? ""),
      turnId: String(record.turnId ?? ""),
      type: "turn_completed",
    };
  }
  return {
    code: String(record.code ?? "AGENT_EVENT_UNKNOWN"),
    message: String(record.message ?? `Unsupported Agent event: ${event}`),
    turnId: typeof record.turnId === "string" ? record.turnId : undefined,
    type: "turn_failed",
  };
}

export function createAgentToolEventParser() {
  let buffer = "";
  return {
    push(chunk: string): CanvasAgentToolEvent[] {
      buffer += chunk;
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      return chunks.flatMap((item) => {
        const parsed = parseEventChunk(item);
        return parsed ? [parsed] : [];
      });
    },
  };
}

export async function readAgentToolEventStream(
  response: Response,
  onEvent: (event: CanvasAgentToolEvent) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Agent executor stream response did not include a body.");
  const decoder = new TextDecoder();
  const parser = createAgentToolEventParser();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const event of parser.push(decoder.decode(value, { stream: true }))) {
      onEvent(event);
    }
  }
}
