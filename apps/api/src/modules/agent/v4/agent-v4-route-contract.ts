export function readAgentV4RouteResponse(stream: boolean, result: { taskId: string; status: string; [key: string]: unknown }) {
  if (!stream) return result;
  return `event: event\ndata: ${JSON.stringify({ taskId: result.taskId, type: "task_started", status: result.status })}\n\nevent: done\ndata: ${JSON.stringify(result)}\n\n`;
}
