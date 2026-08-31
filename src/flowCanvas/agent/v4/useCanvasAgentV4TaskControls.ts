import { useCallback, useState } from "react";
import { approveV4Task, cancelV4Task, retryV4Item, undoV4Task } from "./canvasAgentV4Api";
import type { CanvasAgentV4Task } from "./canvasAgentV4Types";

export function useCanvasAgentV4TaskControls(initial?: CanvasAgentV4Task) {
  const [task, setTask] = useState<CanvasAgentV4Task | undefined>(initial);
  const apply = useCallback((result: Record<string, unknown>) => setTask((current) => current ? { ...current, status: typeof result.status === "string" ? result.status : current.status } : current), []);
  const approve = useCallback(async () => { if (!task) return; apply(await approveV4Task(task.id)); }, [apply, task]);
  const cancel = useCallback(async () => { if (!task) return; apply(await cancelV4Task(task.id)); }, [apply, task]);
  const retry = useCallback(async (itemId: string) => { if (!task) return; apply(await retryV4Item(task.id, itemId)); }, [apply, task]);
  const undo = useCallback(async (revision: number) => { if (!task) return; apply(await undoV4Task(task.id, revision)); }, [apply, task]);
  return { task, setTask, approve, cancel, retry, undo };
}
