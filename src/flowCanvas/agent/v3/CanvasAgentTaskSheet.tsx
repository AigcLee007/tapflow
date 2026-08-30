import React from "react";
import type { CanvasAgentV3Task } from "./canvasAgentV3Types";

export function CanvasAgentTaskSheet({ task, onApprove, onRetry }: { task?: CanvasAgentV3Task; onApprove?: () => void; onRetry?: () => void }) {
  if (!task) return null;
  const approval = task.status === "waiting_for_approval";
  const failed = task.status === "failed" || task.status === "partial_success";
  return <aside className="canvas-agent-v3-task-sheet" aria-label="Canvas Agent task">
    <header><strong>任务进度</strong><span>{task.status}</span></header>
    <section><h3>目标</h3><p>{String(task.events.find((event) => event.type === "task_created")?.payload?.prompt ?? "画布任务")}</p></section>
    <section><h3>事件</h3><ol>{task.events.slice(-8).map((event) => <li key={event.sequence}>{event.type}</li>)}</ol></section>
    {approval && <button type="button" onClick={onApprove}>批准执行</button>}
    {failed && <button type="button" onClick={onRetry}>重试失败步骤</button>}
  </aside>;
}
