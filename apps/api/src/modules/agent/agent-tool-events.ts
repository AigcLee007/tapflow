export type AgentToolEvent =
  | { type: "thinking_status"; label: string; detail?: string }
  | { type: "message_delta"; content: string }
  | { type: "tool_started"; toolCallKey: string; toolName: string }
  | { type: "task_created"; taskId: string; title: string; toolCallKey: string; toolName: string }
  | { type: "workflow_run_linked"; toolCallKey: string; workflowRunId: string; nodeRunId?: string }
  | { type: "artifact_created"; assetRef: unknown; taskId: string; toolCallKey: string }
  | { type: "tool_progress"; message: string; toolCallKey: string }
  | { type: "tool_result"; result: unknown; toolCallKey: string }
  | { type: "approval_required"; estimate: unknown; toolCallKey: string; turnId: string }
  | { type: "turn_completed"; finalText: string; turnId: string }
  | { type: "turn_failed"; code: string; message: string; turnId?: string };

export function formatAgentToolEvent(event: AgentToolEvent): string {
  const { type, ...data } = event;
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}
