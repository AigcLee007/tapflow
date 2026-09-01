import { useCallback, useEffect, useState } from "react";
import { approveV4Task, cancelV4Task, retryV4Item, undoV4Task } from "./canvasAgentV4Api";
import type { CanvasAgentV4Task } from "./canvasAgentV4Types";

export function useCanvasAgentV4TaskControls(initial?: CanvasAgentV4Task) {
  const [task, setTask] = useState<CanvasAgentV4Task | undefined>(initial);
  useEffect(() => {
    if (!initial) return;
    setTask((current) => !current || current.id !== initial.id || initial.lastSequence > current.lastSequence ? initial : current);
  }, [initial]);
  const apply = useCallback((result: Record<string, unknown>) => setTask((current) => {
    if (!current) return current;
    const nextStatus = typeof result.status === "string" ? result.status : current.status;
    const itemId = typeof result.itemId === "string" ? result.itemId : undefined;
    if (!itemId || !current.generationItems) return { ...current, status: nextStatus };
    const itemStatus = typeof result.itemStatus === "string" ? result.itemStatus : undefined;
    const retryCount = typeof result.retryCount === "number" && Number.isInteger(result.retryCount) ? result.retryCount : undefined;
    return {
      ...current,
      status: nextStatus,
      generationItems: current.generationItems.map((item) => item.itemId !== itemId ? item : {
        ...item,
        ...(itemStatus ? { status: itemStatus } : {}),
        ...(retryCount !== undefined ? { retryCount } : {}),
      }),
    };
  }), []);
  const approve = useCallback(async () => { if (!task) return; apply(await approveV4Task(task.id)); }, [apply, task]);
  const cancel = useCallback(async () => { if (!task) return; apply(await cancelV4Task(task.id)); }, [apply, task]);
  const retry = useCallback(async (itemId: string) => { if (!task) return; apply(await retryV4Item(task.id, itemId)); }, [apply, task]);
  const undo = useCallback(async (revision: number) => { if (!task) return; apply(await undoV4Task(task.id, revision)); }, [apply, task]);
  return { task, setTask, approve, cancel, retry, undo };
}
