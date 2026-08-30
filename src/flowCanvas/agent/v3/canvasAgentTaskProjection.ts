import type { CanvasAgentV3Event, CanvasAgentV3Task, CanvasAgentV3TaskStatus } from "./canvasAgentV3Types";

const terminal = new Set<CanvasAgentV3TaskStatus>(["succeeded", "partial_success", "failed", "cancelled"]);
const forbiddenKeys = /(?:provider|credential|upstream.?model|signed.?url|raw.?route|authorization|api.?key|secret|nonce|auth.?tag)/i;
const safePayload = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(safePayload);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !forbiddenKeys.test(key))
    .map(([key, item]) => [key, safePayload(item)]));
};
export function reduceCanvasAgentV3Event(task: CanvasAgentV3Task, event: CanvasAgentV3Event): CanvasAgentV3Task {
  if (!Number.isInteger(event.sequence) || event.sequence <= task.lastSequence || terminal.has(task.status)) return task;
  if (event.status && !["draft", "observing", "planning", "preview_ready", "waiting_for_input", "waiting_for_approval", "running", "verifying", "repairing", "succeeded", "partial_success", "failed", "cancelled"].includes(event.status)) return task;
  const payload = event.payload ? safePayload(event.payload) as Record<string, unknown> : undefined;
  const nextEvent = { sequence: event.sequence, type: event.type, ...(event.status ? { status: event.status } : {}), ...(event.stepId ? { stepId: event.stepId } : {}), ...(payload ? { payload } : {}) };
  return { ...task, status: event.status ?? task.status, lastSequence: event.sequence, events: [...task.events, nextEvent] };
}
