import { describe, expect, it, vi } from "vitest";
import { AgentRuntimeService } from "../src/modules/agent/runtime/agent-runtime.service.js";

const snapshot = { projectId: "project", flowId: "flow", graphRevision: 4, refs: [], skillIds: [], appIds: [], modelKey: null };
const plan = { understanding: "生成一张咖啡海报", questions: [], brief: [], steps: [{ id: "poster", label: "咖啡海报", kind: "image", prompt: "咖啡海报", referenceIds: [], dependsOnStepIds: [] }] };
function harness() {
  let turn: any = { id: "turn", sessionId: "session", prompt: "咖啡海报", contextSnapshot: snapshot, graphRevision: 4, stateVersion: 0, planJson: {}, phase: "understanding", executionState: "idle", blocks: [], pendingDecision: null, idempotencyKey: "turn-key", status: "pending" };
  const repository = {
    getSession: vi.fn().mockResolvedValue({ id: "session", ...snapshot, mode: "manual_confirmation" }),
    createTurnIdempotent: vi.fn(async (_ctx, input) => {
      if (!input.idempotencyKey.startsWith("result-action:")) return turn;
      turn = { ...turn, id: "next-turn", sessionId: "session", prompt: input.prompt, contextSnapshot: input.contextSnapshot, graphRevision: input.graphRevision, idempotencyKey: input.idempotencyKey, stateVersion: 0, blocks: [], pendingDecision: null, planJson: {}, phase: "understanding", executionState: "idle" };
      return turn;
    }), getTurn: vi.fn(async () => turn),
    saveTurnStateCAS: vi.fn(async (_ctx, state) => { if (state.expectedStateVersion !== turn.stateVersion) throw new Error("AGENT_STATE_VERSION_CONFLICT"); turn = { ...turn, ...state, id: state.turnId, stateVersion: turn.stateVersion + 1 }; return turn; }),
    beginDecision: vi.fn(async (_ctx, input) => { turn = { ...turn, stateVersion: turn.stateVersion + 1, pendingDecision: null }; return { decision: { id: "row", resultState: "pending", ...input }, turn, replay: false }; }),
    completeDecision: vi.fn(async (_ctx, state) => { turn = { ...turn, ...state, stateVersion: turn.stateVersion + 1 }; return turn; }),
    getResultRef: vi.fn(), getResultRefsForTurn: vi.fn(), updateResultRef: vi.fn(), listResultRefs: vi.fn().mockResolvedValue([]),
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

  it("persists selection and reference actions only for results in the current turn", async () => {
    const h = harness();
    const result = { id: "result-1", resultGroupId: "group", assetId: "asset-1", runId: "run", kind: "image", label: "首帧", sourceRefs: [], lineage: {}, placedNodeId: null, status: "ready", contentText: null };
    h.repository.getResultRefsForTurn.mockImplementation(async (_ctx, input) => {
      expect(input).toEqual({ sessionId: "session", turnId: "turn", resultIds: ["result-1"] });
      return [result];
    });
    h.repository.updateResultRef.mockResolvedValue({ ...result, status: "selected", lineage: { selected: true } });
    h.repository.listResultRefs.mockResolvedValue([{ ...result, status: "selected", lineage: { selected: true } }]);
    h.getTurn().pendingDecision = { id: "decision", blockId: "results", graphRevision: 4, allowedTypes: ["result_action"] };
    h.getTurn().blocks = [{ type: "result_group", id: "results", results: [{ id: "result-1", label: "首帧", kind: "image", status: "ready", assetId: "asset-1" }] }];
    await h.service.submitDecision(ctx, "session", "turn", { decisionId: "decision", blockId: "results", graphRevision: 4, idempotencyKey: "select-result", type: "result_action", payload: { action: "select", resultIds: ["result-1"] } });
    expect(h.repository.updateResultRef).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant" }), expect.objectContaining({ resultId: "result-1", sessionId: "session", turnId: "turn", status: "selected" }));
  });

  it("binds result actions to the persisted result group block id", async () => {
    const h = harness();
    const result = { id: "result-1", resultGroupId: "group-1", assetId: "asset-1", runId: "run", kind: "image", label: "首帧", sourceRefs: [], lineage: {}, placedNodeId: null, status: "ready", contentText: null };
    h.repository.getResultRefsForTurn.mockResolvedValue([result]);
    h.repository.updateResultRef.mockResolvedValue({ ...result, status: "selected", lineage: { selected: true } });
    h.repository.listResultRefs.mockResolvedValue([{ ...result, status: "selected", lineage: { selected: true } }]);
    h.getTurn().planJson = { resultGroupId: "group-1" };
    h.getTurn().pendingDecision = { id: "decision", blockId: "group-1", graphRevision: 4, allowedTypes: ["result_action"] };
    h.getTurn().blocks = [{ type: "result_group", id: "group-1", results: [{ id: "result-1", label: "首帧", kind: "image", status: "ready", assetId: "asset-1" }] }];
    const response = await h.service.submitDecision(ctx, "session", "turn", { decisionId: "decision", blockId: "group-1", graphRevision: 4, idempotencyKey: "group-bound-result-action", type: "result_action", payload: { action: "select", resultIds: ["result-1"] } });
    expect(response.pendingDecision).toMatchObject({ blockId: "group-1" });
    expect(response.blocks.find(block => block.type === "result_group")).toMatchObject({ id: "group-1" });
  });

  it("persists reference actions without granting them a different result scope", async () => {
    const h = harness();
    const result = { id: "result-1", resultGroupId: "group", assetId: "asset-1", runId: "run", kind: "image", label: "尾帧", sourceRefs: [], lineage: {}, placedNodeId: null, status: "ready", contentText: null };
    h.repository.getResultRefsForTurn.mockImplementation(async (_ctx, input) => {
      expect(input).toEqual({ sessionId: "session", turnId: "turn", resultIds: ["result-1"] });
      return [result];
    });
    h.repository.updateResultRef.mockResolvedValue({ ...result, lineage: { referenced: true } });
    h.repository.listResultRefs.mockResolvedValue([{ ...result, lineage: { referenced: true } }]);
    h.getTurn().pendingDecision = { id: "decision", blockId: "results", graphRevision: 4, allowedTypes: ["result_action"] };
    h.getTurn().blocks = [{ type: "result_group", id: "results", results: [{ id: "result-1", label: "尾帧", kind: "image", status: "ready", assetId: "asset-1" }] }];
    await h.service.submitDecision(ctx, "session", "turn", { decisionId: "decision", blockId: "results", graphRevision: 4, idempotencyKey: "reference-result", type: "result_action", payload: { action: "reference", resultIds: ["result-1"] } });
    expect(h.repository.updateResultRef).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant" }), expect.objectContaining({ resultId: "result-1", sessionId: "session", turnId: "turn", lineage: expect.objectContaining({ referenced: true }) }));
  });

  it("creates a new quoted planning turn for edit and variant actions", async () => {
    const h = harness();
    const result = { id: "result-1", resultGroupId: "group", assetId: "asset-1", runId: "run", kind: "image", label: "首帧", sourceRefs: [], lineage: {}, placedNodeId: null, status: "ready", contentText: null };
    h.repository.getResultRefsForTurn.mockResolvedValue([result]);
    h.getTurn().pendingDecision = { id: "decision", blockId: "results", graphRevision: 4, allowedTypes: ["result_action"] };
    h.getTurn().blocks = [{ type: "result_group", id: "results", results: [{ id: "result-1", label: "首帧", kind: "image", status: "ready", assetId: "asset-1" }] }];
    const response = await h.service.submitDecision(ctx, "session", "turn", { decisionId: "decision", blockId: "results", graphRevision: 4, idempotencyKey: "variant-result", type: "result_action", payload: { action: "variant", resultIds: ["result-1"], instruction: "换成黄昏光线" } });
    expect(h.repository.createTurnIdempotent).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant" }), expect.objectContaining({ prompt: expect.stringContaining("换成黄昏光线"), contextSnapshot: expect.objectContaining({ refs: expect.arrayContaining([expect.objectContaining({ assetId: "asset-1" })]) }) }));
    expect(h.execution.quote).toHaveBeenCalled();
    expect(response.turnId).toBe("next-turn");
    expect(response.phase).toBe("waiting_for_confirmation");
    expect(response.pendingDecision).toMatchObject({ allowedTypes: expect.arrayContaining(["approve_plan"]) });
  });
});
