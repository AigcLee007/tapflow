import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { ExecutorDeps, ExecutorNode } from "./canvasAgentExecutor";
import type { TranscriptItem } from "./canvasAgentTranscript";
import type { CanvasAgentController } from "./useCanvasAgent";
import { useCanvasGenerationExecutor } from "./useCanvasGenerationExecutor";

vi.mock("../runtime/v2WorkflowRunner", () => ({ isBackendWorkflowRunnerEnabled: () => true, runBackendWorkflow: vi.fn() }));
vi.mock("../runtime/remoteDraftSaveBarrier", () => ({ flushRemoteDraftBeforeRun: vi.fn() }));

const ASSET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const plan = { estimatedCredits: 6, modelKey: "m", routeKey: "r", tasks: [{ aspectRatio: "1:1", count: 1, prompt: "p", referenceAssetIds: [], size: "2K" as const, title: "主图1" }] };
const card = (state: "cancelled" | "generating"): TranscriptItem => ({ callId: "call_1", id: "card", kind: "generation", plan, state });

/** Canvas where every started node finishes immediately, or stays running when `hang` is set. */
function deps(hang = false): ExecutorDeps {
  const nodes: ExecutorNode[] = [];
  const listeners = new Set<() => void>();
  return {
    addImageNode: (position, data) => { const node = { data: { status: "idle", ...data }, id: "node-1", position }; nodes.push(node); return node; },
    flushDraft: async () => undefined,
    getNodes: () => nodes,
    runNode: async (id) => {
      const node = nodes.find((item) => item.id === id)!;
      node.data = hang ? { ...node.data, status: "running" } : { ...node.data, assetIds: [ASSET], status: "success" };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

const agentWith = (items: TranscriptItem[], busy: boolean, reportGeneration: CanvasAgentController["reportGeneration"]) =>
  ({ busy, items, reportGeneration } as unknown as CanvasAgentController);

describe("useCanvasGenerationExecutor", () => {
  test("waits for the approve stream to end, then runs and reports the results", async () => {
    const report = vi.fn(async () => undefined);
    const canvas = deps();
    const { rerender } = renderHook(({ busy }) => useCanvasGenerationExecutor(agentWith([card("generating")], busy, report), canvas), { initialProps: { busy: true } });
    expect(canvas.getNodes()).toHaveLength(0);

    rerender({ busy: false });
    await waitFor(() => expect(report).toHaveBeenCalledWith("call_1", [{ assetIds: [ASSET], nodeIds: ["node-1"], status: "succeeded", taskIndex: 0 }]));
  });

  test("stopping the card aborts the run and reports nothing", async () => {
    const report = vi.fn(async () => undefined);
    const canvas = deps(true);
    const { rerender } = renderHook(({ items }) => useCanvasGenerationExecutor(agentWith(items, false, report), canvas), { initialProps: { items: [card("generating")] } });
    await waitFor(() => expect(canvas.getNodes()[0]?.data.status).toBe("running"));

    rerender({ items: [card("cancelled")] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(report).not.toHaveBeenCalled();
  });
});
