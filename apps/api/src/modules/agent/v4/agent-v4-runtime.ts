import { AgentApiError } from "../agent.service.js";
import { agentV4TurnInputSchema } from "./agent-v4-schemas.js";
import { AgentResponsesSessionService } from "./agent-responses-session.service.js";
import { AgentV4TaskStore, type AgentV4TaskRepository } from "./agent-v4-task-store.js";
import { AgentV4ToolGateway } from "./agent-v4-tool-gateway.js";

export type AgentV4RequestContext = { tenantId: string; userId: string | null };
export class AgentV4RuntimeService {
  constructor(private readonly options: { enabled: boolean; repository: AgentV4TaskRepository; session: { getSession: (context: AgentV4RequestContext, id: string) => Promise<{ tenantId?: string; projectId?: string | null; flowId?: string | null } | null> }; textRuntime: { streamText: (...args: any[]) => AsyncIterable<any> }; gateway?: AgentV4ToolGateway }) {}
  private unavailable(): never { throw new AgentApiError(503, "AGENT_V4_UNAVAILABLE", "Canvas Agent V4 is not available."); }
  async startTurn(input: { sessionId: string; context: AgentV4RequestContext; body: unknown }) {
    if (!this.options.enabled) return this.unavailable();
    const session = await this.options.session.getSession(input.context, input.sessionId);
    if (!session || (session.tenantId && session.tenantId !== input.context.tenantId)) throw new AgentApiError(404, "AGENT_SESSION_NOT_FOUND", "Agent session was not found.");
    const body = agentV4TurnInputSchema.parse(input.body);
    if (!session.projectId || !session.flowId) throw new AgentApiError(400, "AGENT_PROJECT_FLOW_REQUIRED", "Agent session is not bound to a project and flow.");
    const store = new AgentV4TaskStore(this.options.repository);
    const task = await store.create({ tenantId: input.context.tenantId, sessionId: input.sessionId, projectId: session.projectId, flowId: session.flowId, graphRevision: body.expectedGraphRevision, prompt: body.prompt, idempotencyKey: body.idempotencyKey });
    const service = new AgentResponsesSessionService({ textRuntime: this.options.textRuntime, store, gateway: this.options.gateway ?? new AgentV4ToolGateway() });
    return service.run({ task, context: input.context, prompt: body.prompt, safeContext: body.snapshot });
  }
  async replayEvents(input: { tenantId: string; taskId: string; afterSeq: number }) { if (!this.options.enabled) return this.unavailable(); return new AgentV4TaskStore(this.options.repository).listEvents(input); }
  async approve() { return this.unavailable(); }
  async cancel() { return this.unavailable(); }
  async retryItem() { return this.unavailable(); }
  async undo() { return this.unavailable(); }
}
