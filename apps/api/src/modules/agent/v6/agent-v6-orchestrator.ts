import type { AgentV6ContextSnapshotInput, AgentV6DecisionInput, AgentV6ScopeInput, AgentV6TurnInput } from "./agent-v6-schemas.js";
import { decisionForV6 } from "./agent-v6-replay.js";
import { buildV6Context, projectV6Response, type AgentV6Response } from "./agent-v6-replay.js";
import type { AgentV6RiskPlan } from "./agent-v6-policy.js";
import { AgentApiError } from "../agent.service.js";

type AgentContext = { tenantId: string; userId: string | null };
type AgentV6Session = { id: string; projectId: string | null; flowId: string | null; executionMode?: "auto" | "manual_confirmation" };
export type AgentV6ServicePort = {
  getSession(context: AgentContext, sessionId: string, scope?: AgentV6ScopeInput): Promise<AgentV6Session>;
  createV5Turn(context: AgentContext, sessionId: string, input: Record<string, unknown>): Promise<unknown>;
  recordV5Decision(context: AgentContext, sessionId: string, turnId: string, decision: Record<string, unknown>, scope: AgentV6ScopeInput): Promise<unknown>;
};

function assertScope(session: AgentV6Session, scope: AgentV6ScopeInput): void {
  if (session.projectId !== scope.projectId || session.flowId !== scope.flowId) {
    throw new AgentApiError(409, "AGENT_SESSION_SCOPE_MISMATCH", "Agent session scope does not match the requested project or flow.");
  }
}

function defaultSnapshot(scope: AgentV6ScopeInput) {
  return { edges: [], flowId: scope.flowId, nodeOutputs: {}, nodes: [], projectId: scope.projectId, selectedNodeIds: [], viewport: { x: 0, y: 0, zoom: 1 } };
}

function defaultReferenceContext() { return { items: [] }; }

function cacheKey(context: AgentContext, sessionId: string, idempotencyKey: string) { return `${context.tenantId}:${sessionId}:${idempotencyKey}`; }

export class AgentV6Orchestrator {
  private readonly turnResults = new Map<string, Promise<AgentV6Response>>();
  private readonly decisionResults = new Map<string, Promise<AgentV6Response>>();
  private readonly pendingByTurn = new Map<string, Record<string, unknown>>();

  constructor(private readonly service: AgentV6ServicePort) {}

  async submitTurn(context: AgentContext, sessionId: string, input: AgentV6TurnInput): Promise<AgentV6Response> {
    const session = await this.service.getSession(context, sessionId, input);
    assertScope(session, input);
    const key = cacheKey(context, sessionId, input.idempotencyKey);
    const cached = this.turnResults.get(key);
    if (cached) return cached;
    const promise = (async () => {
      const contextSnapshot = input.contextSnapshot ?? buildV6Context(input);
      const result = await this.service.createV5Turn(context, sessionId, {
        contextSnapshot,
        idempotencyKey: input.idempotencyKey,
        mode: input.mode,
        modelKey: input.modelKey ?? contextSnapshot.modelKey,
        prompt: input.prompt,
        referenceContext: input.referenceContext ?? defaultReferenceContext(),
        snapshot: input.snapshot ?? defaultSnapshot(input),
      });
      const response = projectV6Response(result, { sessionId, turnId: "", scope: input, contextSnapshot });
      if (response.pendingDecision) this.pendingByTurn.set(`${context.tenantId}:${sessionId}:${response.turnId}`, response.pendingDecision);
      return response;
    })();
    this.turnResults.set(key, promise);
    try { return await promise; } catch (error) { this.turnResults.delete(key); throw error; }
  }

  async submitDecision(context: AgentContext, sessionId: string, turnId: string, input: AgentV6DecisionInput): Promise<AgentV6Response> {
    const session = await this.service.getSession(context, sessionId, input);
    assertScope(session, input);
    const key = cacheKey(context, `${sessionId}:${turnId}`, input.idempotencyKey);
    const cached = this.decisionResults.get(key);
    if (cached) return cached;
    const promise = (async () => {
      const result = await this.service.recordV5Decision(context, sessionId, turnId, decisionForV6(input), input);
      const response = projectV6Response(result, { sessionId, turnId, scope: input, pendingDecision: this.pendingByTurn.get(`${context.tenantId}:${sessionId}:${turnId}`) ?? null });
      if (response.pendingDecision) this.pendingByTurn.set(`${context.tenantId}:${sessionId}:${turnId}`, response.pendingDecision);
      return response;
    })();
    this.decisionResults.set(key, promise);
    try { return await promise; } catch (error) { this.decisionResults.delete(key); throw error; }
  }
}
