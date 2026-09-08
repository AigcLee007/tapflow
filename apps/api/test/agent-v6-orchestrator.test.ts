import { describe, expect, it, vi } from "vitest";

import { AgentV6Orchestrator } from "../src/modules/agent/v6/agent-v6-orchestrator.js";
import { projectV6Response } from "../src/modules/agent/v6/agent-v6-replay.js";
import { requiresV6Confirmation } from "../src/modules/agent/v6/agent-v6-policy.js";
import { agentV6DecisionSchema, agentV6TurnSchema } from "../src/modules/agent/v6/agent-v6-schemas.js";
import { AgentApiError } from "../src/modules/agent/agent.service.js";

const ids = {
  flowId: "33333333-3333-4333-8333-333333333333",
  projectId: "22222222-2222-4222-8222-222222222222",
  sessionId: "11111111-1111-4111-8111-111111111111",
  turnId: "44444444-4444-4444-8444-444444444444",
};

const context = { tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const input = {
  flowId: ids.flowId,
  graphRevision: 3,
  mode: "manual_confirmation" as const,
  projectId: ids.projectId,
  prompt: "设计一个儿童陪伴玩具",
  idempotencyKey: "turn-1",
};

function serviceStub() {
  return {
    getSession: vi.fn(async () => ({ id: ids.sessionId, projectId: ids.projectId, flowId: ids.flowId, executionMode: "manual_confirmation" as const })),
    createV5Turn: vi.fn(async () => ({
      blocks: [{ type: "choice_grid", id: "direction", options: [{ id: "a", label: "方案 A", provider: "internal" }], selectionMode: "single", html: "<script>" }],
      executionState: "idle",
      phase: "waiting_for_choice",
      sessionId: ids.sessionId,
      turnId: ids.turnId,
    })),
    recordV5Decision: vi.fn(async () => ({
      blocks: [{ type: "confirmation_card", text: "confirm", plan: { costCredits: 12, writesCanvas: true, signedUrl: "https://temporary.example" } }],
      executionState: "queued",
      phase: "executing",
      sessionId: ids.sessionId,
      turnId: ids.turnId,
    })),
  };
}

describe("Agent V6 server orchestrator", () => {
  it("validates the V6 request contracts", () => {
    expect(agentV6TurnSchema.parse(input)).toMatchObject({ prompt: input.prompt, mode: input.mode });
    expect(agentV6DecisionSchema.parse({ flowId: ids.flowId, graphRevision: 3, projectId: ids.projectId, type: "confirm", idempotencyKey: "decision-1" })).toMatchObject({ type: "confirm" });
  });

  it("returns the complete safe response shape for an ambiguous prompt", async () => {
    const service = serviceStub();
    const result = await new AgentV6Orchestrator(service).submitTurn(context, ids.sessionId, input);

    expect(result).toMatchObject({ sessionId: ids.sessionId, turnId: ids.turnId, phase: "waiting_for_choice", executionState: "idle", graphRevision: 3, contextSnapshot: { projectId: ids.projectId, flowId: ids.flowId, graphRevision: 3 }, pendingDecision: null });
    expect(result).toHaveProperty("blocks");
    expect(result).not.toHaveProperty("provider");
    expect(JSON.stringify(result)).not.toContain("script");
  });

  it("rejects a session scope mismatch before delegating execution", async () => {
    const service = serviceStub();
    service.getSession.mockResolvedValueOnce({ id: ids.sessionId, projectId: "55555555-5555-4555-8555-555555555555", flowId: ids.flowId, executionMode: "manual_confirmation" });

    const request = new AgentV6Orchestrator(service).submitTurn(context, ids.sessionId, input);
    await expect(request).rejects.toBeInstanceOf(AgentApiError);
    await expect(request).rejects.toMatchObject({ statusCode: 409, code: "AGENT_SESSION_SCOPE_MISMATCH" });
    expect(service.createV5Turn).not.toHaveBeenCalled();
  });

  it("requires server confirmation for paid, batch, canvas, skill, and app work", () => {
    for (const plan of [
      { costCredits: 1 },
      { batch: true },
      { writesCanvas: true },
      { skill: true },
      { app: true },
    ]) expect(requiresV6Confirmation(plan)).toBe(true);
    expect(requiresV6Confirmation({ costCredits: 0 })).toBe(false);
  });

  it("projects only allowlisted response fields and removes sensitive values recursively", () => {
    const result = projectV6Response({
      sessionId: ids.sessionId,
      turnId: ids.turnId,
      phase: "waiting_for_confirmation",
      executionState: "idle",
      graphRevision: 3,
      provider: "provider-secret",
      route: "internal-route",
      credential: "credential-secret",
      signedUrl: "https://temporary.example/file",
      html: "<script>alert(1)</script>",
      base64: "data:image/png;base64,secret",
      blob: "blob:https://example/secret",
      data: "data:text/plain,secret",
      contextSnapshot: { projectId: ids.projectId, flowId: ids.flowId, provider: "nested-provider" },
      plan: { costCredits: 12, provider: "nested-provider", route: "nested-route" },
      pendingDecision: { type: "execute", decisionId: "d", sessionId: ids.sessionId, turnId: ids.turnId, graphRevision: 3, idempotencyKey: "i", payload: { prompt: "safe", credential: "nested-secret", html: "<b>" } },
    }, { sessionId: ids.sessionId, turnId: ids.turnId, scope: input });

    expect(Object.keys(result).sort()).toEqual(["blocks", "contextSnapshot", "executionState", "graphRevision", "pendingDecision", "phase", "plan", "sessionId", "turnId"]);
    expect(JSON.stringify(result)).not.toMatch(/provider|route|credential|signedUrl|html|base64|blob|data:/i);
    expect(result.pendingDecision).toMatchObject({ payload: { prompt: "safe" } });
  });

  it("holds risky plans for confirmation and only delegates after confirm", async () => {
    const service = serviceStub();
    service.createV5Turn.mockResolvedValueOnce({
      blocks: [],
      executionState: "running",
      phase: "executing",
      plan: { costCredits: 12, writesCanvas: true },
      sessionId: ids.sessionId,
      turnId: ids.turnId,
    });
    const orchestrator = new AgentV6Orchestrator(service);

    const pending = await orchestrator.submitTurn(context, ids.sessionId, input);
    expect(pending.phase).toBe("waiting_for_confirmation");
    expect(pending.pendingDecision).toMatchObject({ type: "execute", graphRevision: 3 });
    expect(service.recordV5Decision).not.toHaveBeenCalled();

    await orchestrator.submitDecision(context, ids.sessionId, ids.turnId, {
      flowId: ids.flowId,
      graphRevision: 3,
      idempotencyKey: "confirm-risk-1",
      projectId: ids.projectId,
      type: "confirm",
    });
    expect(service.recordV5Decision).toHaveBeenCalledTimes(1);
  });

  it("delegates confirmed decisions and deduplicates the same turn idempotency key", async () => {
    const service = serviceStub();
    const orchestrator = new AgentV6Orchestrator(service);
    const first = await orchestrator.submitTurn(context, ids.sessionId, input);
    const second = await orchestrator.submitTurn(context, ids.sessionId, input);

    expect(second).toEqual(first);
    expect(service.createV5Turn).toHaveBeenCalledTimes(1);

    const result = await orchestrator.submitDecision(context, ids.sessionId, ids.turnId, {
      flowId: ids.flowId,
      graphRevision: 3,
      idempotencyKey: "decision-1",
      projectId: ids.projectId,
      type: "confirm",
    });
    expect(result.phase).toBe("executing");
    expect(service.recordV5Decision).toHaveBeenCalledTimes(1);
  });

  it("preserves stale graph conflicts from the existing service", async () => {
    const service = serviceStub();
    service.createV5Turn.mockRejectedValueOnce(new AgentApiError(409, "FLOW_DRAFT_REVISION_CONFLICT", "stale"));

    await expect(new AgentV6Orchestrator(service).submitTurn(context, ids.sessionId, input)).rejects.toMatchObject({ statusCode: 409, code: "FLOW_DRAFT_REVISION_CONFLICT" });
  });
});
