import type { CanvasAgentV4Task } from "./canvasAgentV4Types";

export function CanvasAgentV4TaskPanel({ task, onApprove, onCancel, onRetry }: { task?: CanvasAgentV4Task; onApprove?: () => void; onCancel?: () => void; onRetry?: (itemId: string) => void }) {
  if (!task) return <aside aria-label="Canvas Agent V4 task panel">尚未开始任务</aside>;
  const failed = task.generationItems?.filter((item) => item.status === "failed") ?? [];
  return <aside aria-label="Canvas Agent V4 task panel"><h2>Canvas Agent V4</h2><p>状态：{task.status}</p><p>事件：{task.events.length}</p>{task.status === "waiting_for_approval" && <button type="button" onClick={onApprove}>批准执行</button>}{!['succeeded', 'failed', 'cancelled'].includes(task.status) && <button type="button" onClick={onCancel}>取消任务</button>}{failed.map((item) => <button key={item.itemId} type="button" onClick={() => onRetry?.(item.itemId)}>重试 {item.itemId}</button>)}</aside>;
}
