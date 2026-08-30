import type { CanvasAgentV3Event, CanvasAgentV3Task, CanvasAgentV3TaskStatus } from "./canvasAgentV3Types";

const terminal = new Set<CanvasAgentV3TaskStatus>(["succeeded", "partial_success", "failed", "cancelled"]);
export function reduceCanvasAgentV3Event(task: CanvasAgentV3Task, event: CanvasAgentV3Event): CanvasAgentV3Task {
  if (!Number.isInteger(event.sequence) || event.sequence <= task.lastSequence || terminal.has(task.status)) return task;
  if (event.status && !["draft", "observing", "planning", "preview_ready", "waiting_for_input", "waiting_for_approval", "running", "verifying", "repairing", "succeeded", "partial_success", "failed", "cancelled"].includes(event.status)) return task;
  return { ...task, status: event.status ?? task.status, lastSequence: event.sequence, events: [...task.events, { sequence: event.sequence, type: event.type, ...(event.status ? { status: event.status } : {}), ...(event.payload ? { payload: event.payload } : {}) }] };
}
