import { describe, expect, it, vi } from "vitest";
import { AgentRuntimeService } from "../src/modules/agent/runtime/agent-runtime.service.js";

const snapshot = { projectId: "project", flowId: "flow", graphRevision: 4, refs: [], skillIds: [], appIds: [], modelKey: null };
const plan = { understanding: "生成一张咖啡海报", questions: [], brief: [], steps: [{ id: "poster", label: "咖啡海报", kind: "image", prompt: "咖啡海报", referenceIds: [], dependsOnStepIds: [] }] };
function harness() {
  let turn: any = { id: "turn", sessionId: "session", prompt: "咖啡海报", contextSnapshot: snapshot, graphRevision: 4, stateVersion: 0, planJson: {}, phase: "understanding", executionState: "idle", blocks: [], pendingDecision: null, idempotencyKey: "turn-key", status: "pending" };
  const repository = {
    getSession: vi.fn().mockResolvedValue({ id: "session", ...snapshot, mode: "manual_confirmation" }),
    createTurnIdempotent: vi.fn(async () => turn), getTurn: vi.fn(async () => turn),
    saveTurnStateCAS: vi.fn(async (_ctx, state) => { if (state.expectedStateVersion !== turn.stateVersion) throw new Error("AGENT_STATE_VERSION_CONFLICT"); turn = { ...turn, ...state, stateVersion: turn.stateVersion + 1 }; return turn; }),
    beginDecision: vi.fn(async (_ctx, input) => { turn = { ...turn, stateVersion: turn.stateVersion + 1, pendingDecision: null }; return { decision: { id: "row", resultState: "pending", ...input }, turn, replay: false }; }),
    completeDecision: vi.fn(async (_ctx, state) => { turn = { ...turn, ...state, stateVersion: turn.stateVersion + 1 }; return turn; }),
  };
  const planner = { plan: vi.fn().mockResolvedValue(plan) };
  const context = { assemble: vi.fn().mockResolvedValue(snapshot), models: vi.fn().mockResolvedValue([]), resolveSteps: vi.fn().mockResolvedValue([{ stepId: "poster", kind: "image", prompt: "咖啡海报", routeKey: "internal" }]) };
  const execution = { quote: vi.fn().mockResolvedValue({ credits: 25, fingerprint: "f".repeat(64), steps: [{ stepId: "poster", credits: 25, modelDisplayName: "画图模型", modelKey: "internal-model" }] }), start: vi.fn().mockResolvedValue({ runId: "run", status: "pending", nodeIdsByStepId: { poster: "node" } }) };
  const service = new AgentRuntimeService({ repository, planner, context, execution } as never);
  return { service, repository, planner, context, execution, getTurn: () => turn };
}
const ctx = { tenantId: "tenant", userId: "user", permissions: ["flow:read", "flow:run", "flow:update"] };
describe("Agent runtime orchestration", () => {
  it("plans a general task with real quoted credits and requires a bound approval", async () => {
    const h = harness();
    const response = await h.service.submitTurn(ctx, "session", { prompt: "咖啡海报", contextSnapshot: snapshot, idempotencyKey: "turn-key" });
    expect(h.planner.plan).toHaveBeenCalledOnce();
    expect(response.phase).toBe("waiting_for_confirmation");
    expect(response.blocks.find(block => block.type === "confirmation")).toMatchObject({ costCredits: 25 });
    expect(JSON.stringify(response)).not.toContain("internal");
    expect(h.execution.start).not.toHaveBeenCalled();
    expect(response.pendingDecision).toMatchObject({ allowedTypes: expect.arrayContaining(["approve_plan"]) });
  });
  it("does not permit browser assertions or a user without run permission to start execution", async () => {
    const h = harness();
    await h.service.submitTurn(ctx, "session", { prompt: "咖啡海报", contextSnapshot: snapshot, idempotencyKey: "turn-key" });
    const pending = h.getTurn().pendingDecision;
    const input = { decisionId: pending.id, blockId: pending.blockId, graphRevision: 4, idempotencyKey: "decision", type: "approve_plan", payload: {} };
    await expect(h.service.submitDecision({ ...ctx, permissions: ["flow:read"] }, "session", "turn", input as never)).rejects.toThrow("AGENT_PERMISSION_DENIED");
    await expect(h.service.submitDecision(ctx, "session", "turn", { ...input, payload: { permission: true, pricing: { credits: 0 } } } as never)).rejects.toThrow();
    expect(h.execution.start).not.toHaveBeenCalled();
  });
  it("persists the accepted execution before enqueue and uses only server-resolved steps and quote", async () => {
    const h = harness();
    await h.service.submitTurn(ctx, "session", { prompt: "咖啡海报", contextSnapshot: snapshot, idempotencyKey: "turn-key" });
    const pending = h.getTurn().pendingDecision;
    await h.service.submitDecision(ctx, "session", "turn", { decisionId: pending.id, blockId: pending.blockId, graphRevision: 4, idempotencyKey: "decision", type: "approve_plan", payload: {} });
    expect(h.execution.start).toHaveBeenCalledOnce();
    expect(h.repository.completeDecision.mock.invocationCallOrder[0]).toBeLessThan(h.execution.start.mock.invocationCallOrder[0]);
    expect(h.execution.start.mock.calls[0][1]).toMatchObject({ expectedQuoteFingerprint: "f".repeat(64), steps: [{ routeKey: "internal" }] });
  });
  it("replans using submitted answers instead of throwing them away", async () => {
    const h = harness();
    h.planner.plan.mockResolvedValueOnce({ ...plan, steps: [], questions: [{ id: "subject", prompt: "主体", kind: "text", required: true }] });
    await h.service.submitTurn(ctx, "session", { prompt: "画张图", contextSnapshot: snapshot, idempotencyKey: "turn-key" });
    const pending = h.getTurn().pendingDecision;
    await h.service.submitDecision(ctx, "session", "turn", { decisionId: pending.id, blockId: pending.blockId, graphRevision: 4, idempotencyKey: "answer", type: "answer_question", payload: { answers: { subject: "机器人" } } });
    expect(h.planner.plan.mock.calls[1][1]).toMatchObject({ answers: { subject: "机器人" } });
    expect(h.execution.start).not.toHaveBeenCalled();
  });
  it("accepts one answer from a multi-question clarification round and replans for the remaining answers", async () => {
    const h = harness();
    h.planner.plan.mockResolvedValueOnce({ ...plan, steps: [], questions: [
      { id: "subject", prompt: "主体", kind: "text", required: true },
      { id: "ratio", prompt: "比例", kind: "single", required: true, options: [{ id: "vertical", label: "9:16" }] },
    ] });
    await h.service.submitTurn(ctx, "session", { prompt: "画张图", contextSnapshot: snapshot, idempotencyKey: "turn-key" });
    const pending = h.getTurn().pendingDecision;
    await h.service.submitDecision(ctx, "session", "turn", { decisionId: pending.id, blockId: pending.blockId, graphRevision: 4, idempotencyKey: "answer-one", type: "answer_question", payload: { answers: { subject: "机器人" } } });
    expect(h.planner.plan.mock.calls[1][1]).toMatchObject({ answers: { subject: "机器人" } });
  });
});
