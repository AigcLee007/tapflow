import { describe, expect, it, vi } from "vitest";

import { AgentRuntimeService } from "./agent-runtime.service.js";

const snapshot = { projectId: null, flowId: null, graphRevision: 0, refs: [], skillIds: [], appIds: [], modelKey: null } as const;

function repository() {
  return {
    getSession: vi.fn().mockResolvedValue({ id: "session-1", tenantId: "tenant-1", projectId: null, flowId: null, title: "Agent", mode: "manual_confirmation", phase: "idle", graphRevision: 0, status: "active" }),
    createTurnIdempotent: vi.fn().mockResolvedValue({ id: "turn-1", sessionId: "session-1", prompt: "", graphRevision: 0, idempotencyKey: "t1", phase: "understanding", executionState: "idle", blocks: [], pendingDecision: null, status: "pending", createdAt: "now", updatedAt: "now", contextSnapshot: snapshot }),
    saveTurnStateCAS: vi.fn().mockImplementation(async (_ctx, input) => ({ ...input, id: "turn-1", sessionId: "session-1", prompt: "", idempotencyKey: "t1", blocks: input.blocks, pendingDecision: input.pendingDecision ?? null, status: "planned", createdAt: "now", updatedAt: "now", contextSnapshot: snapshot })),
    appendEvent: vi.fn().mockResolvedValue({ seq: 1 }),
    createDecisionIdempotent: vi.fn(),
  };
}

describe("AgentRuntimeService", () => {
  it("asks bounded questions for a first-last-frame goal instead of running a demo", async () => {
    const repo = repository();
    const runtime = new AgentRuntimeService({
      repository: repo as never,
      planner: { understand: vi.fn() },
      policy: { evaluate: vi.fn() },
      execution: { reserveAndEnqueue: vi.fn() },
    });
    const response = await runtime.submitTurn({ tenantId: "tenant-1", userId: "user-1" }, "session-1", {
      prompt: "我要生成两张图，用来测试一个首尾帧视频的生成，需要一个首帧图片和一个尾帧图片，同时需要首尾帧视频的提示词",
      contextSnapshot: snapshot,
      idempotencyKey: "t1",
    });
    expect(response.phase).toBe("waiting_for_input");
    expect(response.blocks.some((block) => block.type === "question_set")).toBe(true);
    expect(response.blocks.some((block) => block.type === "understanding" && block.text.includes("首帧"))).toBe(true);
    expect(repo.appendEvent).toHaveBeenCalled();
  });
});
