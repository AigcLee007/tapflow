import { describe, expect, test, vi } from "vitest";

import { executeGenerationPlan, findFreeSlots, type ExecutorDeps, type ExecutorNode } from "./canvasAgentExecutor";
import type { CanvasAgentGenerationPlan } from "./canvasAgentTypes";

const ASSET_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASSET_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const plan: CanvasAgentGenerationPlan = {
  estimatedCredits: 12, modelKey: "seedream-5-pro", routeKey: "image.seedream.line1",
  tasks: [
    { aspectRatio: "3:4", count: 1, prompt: "墨绿羽绒服", referenceAssetIds: [ASSET_B], size: "2K", title: "款式候选A" },
    { aspectRatio: "3:4", count: 1, prompt: "亮橘羽绒服", referenceAssetIds: [], size: "2K", title: "款式候选B" },
  ],
};

/** In-memory canvas: runNode marks a node running; finish() completes it like the run stream would. */
function fakeCanvas(initial: ExecutorNode[] = []) {
  const nodes: ExecutorNode[] = [...initial];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  let next = 0;
  const deps: ExecutorDeps & { flushDraft: ReturnType<typeof vi.fn>; runNode: ReturnType<typeof vi.fn> } = {
    addImageNode: (position, data) => {
      const node = { data: { height: 400, status: "idle", width: 300, ...data }, id: `node-${(next += 1)}`, position };
      nodes.push(node);
      return node;
    },
    flushDraft: vi.fn(async () => undefined),
    getNodes: () => nodes,
    runNode: vi.fn(async (nodeId: string) => { patch(nodeId, { status: "running" }); }),
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  function patch(nodeId: string, data: Record<string, unknown>) {
    const node = nodes.find((item) => item.id === nodeId)!;
    node.data = { ...node.data, ...data };
    notify();
  }
  return { deps, nodes, patch };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("findFreeSlots", () => {
  test("starts at the origin on an empty canvas and wraps every 4", () => {
    const slots = findFreeSlots([], 5);
    expect(slots[0]).toEqual({ x: 0, y: 0 });
    expect(slots[4]).toEqual({ x: 0, y: 440 });
  });
  test("places new nodes to the right of existing ones", () => {
    const slots = findFreeSlots([{ data: { width: 300 }, id: "a", position: { x: 100, y: 50 } }], 1);
    expect(slots[0]).toEqual({ x: 480, y: 50 });
  });
});

describe("executeGenerationPlan", () => {
  test("creates one tagged node per task, saves, runs each, and reports assets", async () => {
    const canvas = fakeCanvas();
    const progress = vi.fn();
    const running = executeGenerationPlan({ callId: "call_1", deps: canvas.deps, onProgress: progress, plan, signal: new AbortController().signal });
    await tick();

    expect(canvas.nodes).toHaveLength(2);
    expect(canvas.nodes[0]!.data).toMatchObject({
      agentCallId: "call_1", agentTaskIndex: 0, generationPrompt: "墨绿羽绒服", routeKey: plan.routeKey, title: "款式候选A",
      agentTool: { aspectRatio: "3:4", n: 1, prompt: "墨绿羽绒服", referenceAssetIds: [ASSET_B], routeKey: plan.routeKey, size: "2K" },
    });
    expect(canvas.deps.flushDraft).toHaveBeenCalledTimes(1);
    expect(canvas.deps.runNode.mock.calls.map(([id]) => id)).toEqual(["node-1", "node-2"]);

    canvas.patch("node-1", { assetId: ASSET_A, assetIds: [ASSET_A], status: "success" });
    canvas.patch("node-2", { errorMessage: "内容审核未通过", status: "failed" });
    await expect(running).resolves.toEqual([
      { assetIds: [ASSET_A], nodeIds: ["node-1"], status: "succeeded", taskIndex: 0 },
      { assetIds: [], error: "内容审核未通过", nodeIds: ["node-2"], status: "failed", taskIndex: 1 },
    ]);
    expect(progress).toHaveBeenLastCalledWith({ done: 2, total: 2 });
  });

  test("reopening reuses nodes from the same call: no new nodes, no second charge", async () => {
    const canvas = fakeCanvas([
      { data: { agentCallId: "call_1", agentTaskIndex: 0, assetId: ASSET_A, status: "success" }, id: "old-a", position: { x: 0, y: 0 } },
      { data: { agentCallId: "call_1", agentTaskIndex: 1, status: "running" }, id: "old-b", position: { x: 340, y: 0 } },
    ]);
    const running = executeGenerationPlan({ callId: "call_1", deps: canvas.deps, plan, signal: new AbortController().signal });
    await tick();
    expect(canvas.nodes).toHaveLength(2);
    expect(canvas.deps.runNode).not.toHaveBeenCalled();
    expect(canvas.deps.flushDraft).not.toHaveBeenCalled();

    canvas.patch("old-b", { assetIds: [ASSET_B], status: "success" });
    const results = await running;
    expect(results.map((r) => [r.status, r.assetIds])).toEqual([["succeeded", [ASSET_A]], ["succeeded", [ASSET_B]]]);
  });

  test("a launch failure (e.g. insufficient credits) fails that task and the rest continue", async () => {
    const canvas = fakeCanvas();
    canvas.deps.runNode.mockImplementationOnce(async () => { throw new Error("积分不足"); });
    const running = executeGenerationPlan({ callId: "call_1", deps: canvas.deps, plan, signal: new AbortController().signal });
    await tick();
    expect(canvas.deps.runNode).toHaveBeenCalledTimes(2);
    canvas.patch("node-2", { assetIds: [ASSET_B], status: "success" });
    const results = await running;
    expect(results[0]).toMatchObject({ error: "积分不足", status: "failed" });
    expect(results[1]).toMatchObject({ status: "succeeded" });
  });

  test("stopping returns promptly with the unfinished tasks cancelled", async () => {
    const canvas = fakeCanvas();
    const controller = new AbortController();
    const running = executeGenerationPlan({ callId: "call_1", deps: canvas.deps, plan, signal: controller.signal });
    await tick();
    canvas.patch("node-1", { assetIds: [ASSET_A], status: "success" });
    controller.abort();
    const results = await running;
    expect(results.map((r) => r.status)).toEqual(["succeeded", "cancelled"]);
  });

  test("a node that never finishes times out as failed", async () => {
    const canvas = fakeCanvas();
    const results = await executeGenerationPlan({ callId: "call_1", deps: canvas.deps, plan, signal: new AbortController().signal, timeoutMs: 20 });
    expect(results.map((r) => [r.status, r.error])).toEqual([["failed", "生成超时"], ["failed", "生成超时"]]);
  });
});
