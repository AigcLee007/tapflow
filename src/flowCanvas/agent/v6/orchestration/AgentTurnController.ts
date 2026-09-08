import type { AgentDecision, AgentExecutionMode } from "../protocol/conversationTypes";
import { agentV6Api, type AgentV6Api, type AgentV6CancelInput, type AgentV6DecisionInput, type AgentV6Response, type AgentV6Scope, type AgentV6TurnInput } from "./agentV6Api";
import { AgentSessionController } from "./AgentSessionController";

export type SubmitTurnInput = AgentV6Scope & { prompt: string; idempotencyKey: string; sessionId?: string };
export type DecisionInput = AgentV6Scope & { sessionId: string; turnId: string; idempotencyKey: string };

export class AgentTurnController {
  private readonly api: AgentV6Api;
  private readonly sessions: AgentSessionController;

  constructor(api: AgentV6Api = agentV6Api, sessions = new AgentSessionController(api)) {
    this.api = api;
    this.sessions = sessions;
  }

  async submit(input: SubmitTurnInput): Promise<AgentV6Response> {
    const sessionId = input.sessionId ?? this.sessions.sessionId;
    if (!sessionId) throw new Error("AGENT_V6_SESSION_REQUIRED");
    const request: AgentV6TurnInput = { projectId: input.projectId, flowId: input.flowId, graphRevision: input.graphRevision, prompt: input.prompt, idempotencyKey: input.idempotencyKey };
    return this.api.submitTurn(sessionId, request);
  }

  async decision(decision: AgentDecision | Record<string, unknown>, input: DecisionInput): Promise<AgentV6Response> {
    const request: AgentV6DecisionInput = { ...input, type: typeof decision.type === "string" ? decision.type : "decision", payload: decision as Record<string, unknown> };
    return this.api.submitDecision(input.sessionId, input.turnId, request);
  }

  async confirm(input: DecisionInput): Promise<AgentV6Response> {
    return this.api.confirmExecution(input.sessionId, input.turnId, { ...input, type: "confirm", payload: { type: "confirm" } });
  }

  async setMode(mode: AgentExecutionMode, input: AgentV6Scope & { sessionId?: string }): Promise<void> {
    const sessionId = input.sessionId ?? this.sessions.sessionId;
    if (!sessionId) throw new Error("AGENT_V6_SESSION_REQUIRED");
    await this.api.setMode(sessionId, { projectId: input.projectId, flowId: input.flowId, graphRevision: input.graphRevision, mode });
    this.sessions.updateMode(mode);
  }

  async cancel(input: AgentV6CancelInput): Promise<AgentV6Response> {
    return this.api.cancelTurn(input.sessionId, input);
  }
}
