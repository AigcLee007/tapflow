export function readAgentV4RouteResponse(stream: boolean, result: { taskId: string; status: string; [key: string]: unknown }) {
  if (!stream) return result;
  return `event: event\ndata: ${JSON.stringify({ taskId: result.taskId, type: "task_started", status: result.status })}\n\nevent: done\ndata: ${JSON.stringify(result)}\n\n`;
}

export function parseV4AfterSequence(value: string | number | undefined): number {
  if (value === undefined || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) throw Object.assign(new Error("INVALID_REQUEST"), { statusCode: 400 });
  return Math.max(0, parsed);
}
