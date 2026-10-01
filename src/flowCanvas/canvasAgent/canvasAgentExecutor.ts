import type { CanvasAgentGenerationPlan, CanvasAgentGenerationResult } from "./canvasAgentTypes";

/**
 * Runs an approved agent generation plan on the canvas: one image node per
 * task, executed through the normal node-run path, then reports results.
 * Pure orchestration — all canvas/runner access is injected so it is testable.
 */

export type ExecutorNode = {
  data: Record<string, unknown>;
  id: string;
  position: { x: number; y: number };
};

export type ExecutorDeps = {
  addImageNode: (position: { x: number; y: number }, data: Record<string, unknown>) => ExecutorNode;
  /** Persist the draft so the server sees the new nodes before a run starts. */
  flushDraft: () => Promise<void>;
  getNodes: () => readonly ExecutorNode[];
  /** Start a target-node run (credits are reserved inside). */
  runNode: (nodeId: string) => Promise<void>;
  /** Calls back whenever canvas state changes; returns an unsubscribe. */
  subscribe: (listener: () => void) => () => void;
};

const GAP = 40;
const COLUMNS = 4;
const DEFAULT_SIZE = { height: 400, width: 300 };
export const GENERATION_TIMEOUT_MS = 15 * 60_000;

const SUCCESS = new Set(["success", "succeeded"]);
const TERMINAL = new Set(["success", "succeeded", "failed", "error", "cancelled", "canceled"]);

const sizeOf = (node: ExecutorNode) => ({
  height: Number(node.data.height) || DEFAULT_SIZE.height,
  width: Number(node.data.width) || DEFAULT_SIZE.width,
});

/** Grid of free slots to the right of everything already on the canvas. */
export function findFreeSlots(nodes: readonly ExecutorNode[], count: number, size = DEFAULT_SIZE): Array<{ x: number; y: number }> {
  let originX = 0;
  let originY = 0;
  if (nodes.length) {
    originX = Math.max(...nodes.map((node) => node.position.x + sizeOf(node).width)) + GAP * 2;
    originY = Math.min(...nodes.map((node) => node.position.y));
  }
  return Array.from({ length: count }, (_value, index) => ({
    x: originX + (index % COLUMNS) * (size.width + GAP),
    y: originY + Math.floor(index / COLUMNS) * (size.height + GAP),
  }));
}

const statusOf = (node: ExecutorNode | undefined) => String(node?.data.status ?? "idle");

function assetIdsOf(node: ExecutorNode): string[] {
  const ids = Array.isArray(node.data.assetIds) ? node.data.assetIds.map(String) : [];
  const primary = typeof node.data.assetId === "string" ? [node.data.assetId] : [];
  return [...new Set([...primary, ...ids])].filter(Boolean).slice(0, 8);
}

/** Nodes this agent call already created (reopening a session must not create or pay twice). */
function existingNodesFor(nodes: readonly ExecutorNode[], callId: string): Map<number, ExecutorNode> {
  const found = new Map<number, ExecutorNode>();
  for (const node of nodes) {
    if (node.data.agentCallId === callId && typeof node.data.agentTaskIndex === "number") found.set(node.data.agentTaskIndex, node);
  }
  return found;
}

function waitForTerminal(deps: ExecutorDeps, nodeIds: string[], signal: AbortSignal, timeoutMs: number, onProgress?: (done: number) => void): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    const check = () => {
      if (finished) return;
      const byId = new Map(deps.getNodes().map((node) => [node.id, node]));
      const done = nodeIds.filter((id) => TERMINAL.has(statusOf(byId.get(id)))).length;
      onProgress?.(done);
      if (done === nodeIds.length || signal.aborted) finish();
    };
    const timer = setTimeout(() => finish(), timeoutMs);
    const unsubscribe = deps.subscribe(check);
    const onAbort = () => finish();
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
      resolve();
    }
    signal.addEventListener("abort", onAbort);
    check();
  });
}

export async function executeGenerationPlan(input: {
  callId: string;
  deps: ExecutorDeps;
  onProgress?: (progress: { done: number; total: number }) => void;
  plan: CanvasAgentGenerationPlan;
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<CanvasAgentGenerationResult[]> {
  const { callId, deps, plan, signal } = input;
  const total = plan.tasks.length;
  const existing = existingNodesFor(deps.getNodes(), callId);
  const missing = plan.tasks.map((_task, index) => index).filter((index) => !existing.has(index));
  const slots = findFreeSlots(deps.getNodes(), missing.length);

  const nodeIdByTask = new Map<number, string>([...existing].map(([index, node]) => [index, node.id]));
  missing.forEach((taskIndex, slot) => {
    const task = plan.tasks[taskIndex]!;
    const node = deps.addImageNode(slots[slot]!, {
      agentCallId: callId,
      agentTaskIndex: taskIndex,
      // Read by the worker (apps/worker/src/workflow-runtime/service.ts buildImageRequest).
      agentTool: {
        aspectRatio: task.aspectRatio, n: task.count, prompt: task.prompt, referenceAssetIds: task.referenceAssetIds,
        routeKey: plan.routeKey, size: task.size,
      },
      generationPrompt: task.prompt,
      // Read by credit pre-flight (v2WorkflowRunner getRouteKeyForPricing).
      routeKey: plan.routeKey,
      title: task.title,
    });
    nodeIdByTask.set(taskIndex, node.id);
  });
  if (missing.length) await deps.flushDraft();

  const launchErrors = new Map<number, string>();
  const tracked: string[] = [];
  for (let taskIndex = 0; taskIndex < total; taskIndex += 1) {
    const nodeId = nodeIdByTask.get(taskIndex)!;
    const status = statusOf(deps.getNodes().find((node) => node.id === nodeId));
    tracked.push(nodeId);
    // Already finished or already running from an earlier attempt: just wait for it.
    if (TERMINAL.has(status) || status !== "idle") continue;
    if (signal.aborted) { launchErrors.set(taskIndex, "已停止"); continue; }
    try {
      await deps.runNode(nodeId);
    } catch (error) {
      launchErrors.set(taskIndex, error instanceof Error ? error.message.slice(0, 300) : "启动生成失败");
    }
  }

  const pending = tracked.filter((_id, index) => !launchErrors.has(index));
  await waitForTerminal(deps, pending, signal, input.timeoutMs ?? GENERATION_TIMEOUT_MS, (done) => input.onProgress?.({ done: done + launchErrors.size, total }));

  const byId = new Map(deps.getNodes().map((node) => [node.id, node]));
  return plan.tasks.map((_task, taskIndex) => {
    const nodeId = nodeIdByTask.get(taskIndex)!;
    const node = byId.get(nodeId);
    const status = statusOf(node);
    const launchError = launchErrors.get(taskIndex);
    if (!launchError && node && SUCCESS.has(status)) {
      return { assetIds: assetIdsOf(node).filter((id) => /^[0-9a-f-]{36}$/i.test(id)), nodeIds: [nodeId], status: "succeeded" as const, taskIndex };
    }
    const cancelled = signal.aborted || status === "cancelled" || status === "canceled";
    const error = launchError ?? (typeof node?.data.errorMessage === "string" ? node.data.errorMessage.slice(0, 300) : TERMINAL.has(status) ? undefined : "生成超时");
    return { assetIds: [], nodeIds: [nodeId], status: cancelled ? "cancelled" as const : "failed" as const, taskIndex, ...(error ? { error } : {}) };
  });
}
