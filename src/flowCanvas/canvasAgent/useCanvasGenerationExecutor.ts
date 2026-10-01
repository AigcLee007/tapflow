import { useEffect, useRef, useState } from "react";

import { flushRemoteDraftBeforeRun } from "../runtime/remoteDraftSaveBarrier";
import { isBackendWorkflowRunnerEnabled, runBackendWorkflow } from "../runtime/v2WorkflowRunner";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import type { FlowNodeData } from "../types";
import { executeGenerationPlan, type ExecutorDeps, type ExecutorNode } from "./canvasAgentExecutor";
import type { CanvasAgentController } from "./useCanvasAgent";

export type GenerationProgress = Record<string, { done: number; total: number }>;

const storeDeps: ExecutorDeps = {
  addImageNode: (position, data) => useFlowCanvasStore.getState().addNode("image", position, data as Partial<FlowNodeData>) as unknown as ExecutorNode,
  flushDraft: () => flushRemoteDraftBeforeRun(),
  getNodes: () => useFlowCanvasStore.getState().nodes as unknown as ExecutorNode[],
  runNode: (nodeId) => runBackendWorkflow({ runMode: "target_node", targetNodeId: nodeId }),
  subscribe: (listener) => useFlowCanvasStore.subscribe(listener),
};

/**
 * Executes approved agent generation batches on the canvas and reports the
 * results back to the agent. Starts when a card enters "generating" (and the
 * agent stream has ended), aborts when the card is stopped or the panel closes.
 */
export function useCanvasGenerationExecutor(agent: CanvasAgentController, deps: ExecutorDeps = storeDeps) {
  const running = useRef(new Map<string, AbortController>());
  const [progress, setProgress] = useState<GenerationProgress>({});
  const { busy, items, reportGeneration } = agent;

  useEffect(() => {
    for (const item of items) {
      if (item.kind !== "generation") continue;
      const active = running.current.get(item.callId);
      if (item.state !== "generating") {
        if (active) { active.abort(); running.current.delete(item.callId); }
        continue;
      }
      // Wait until the approve stream has ended so the server session is free to resume.
      if (active || busy) continue;

      const controller = new AbortController();
      running.current.set(item.callId, controller);
      const { callId, plan } = item;
      void (async () => {
        const results = isBackendWorkflowRunnerEnabled()
          ? await executeGenerationPlan({
            callId, deps, plan, signal: controller.signal,
            onProgress: (value) => setProgress((current) => ({ ...current, [callId]: value })),
          }).catch((error: unknown) => plan.tasks.map((_task, taskIndex) => ({
            assetIds: [], error: error instanceof Error ? error.message.slice(0, 300) : "画布执行失败",
            nodeIds: [], status: "failed" as const, taskIndex,
          })))
          : plan.tasks.map((_task, taskIndex) => ({ assetIds: [], error: "当前环境未开启画布生成", nodeIds: [], status: "failed" as const, taskIndex }));
        // Stopped or panel closed: the server already closed the call (or will resume it on reopen).
        if (controller.signal.aborted || running.current.get(callId) !== controller) return;
        running.current.delete(callId);
        await reportGeneration(callId, results);
      })();
    }
  }, [busy, deps, items, reportGeneration]);

  useEffect(() => {
    const map = running.current;
    return () => { map.forEach((controller) => controller.abort()); map.clear(); };
  }, []);

  return { progress };
}
