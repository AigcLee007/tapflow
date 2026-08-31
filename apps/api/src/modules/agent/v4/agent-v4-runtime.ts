import { AgentApiError } from "../agent.service.js";
import { agentV4TurnInputSchema } from "./agent-v4-schemas.js";
import { AgentResponsesSessionService } from "./agent-responses-session.service.js";
import { AgentV4TaskStore, type AgentV4TaskRepository } from "./agent-v4-task-store.js";
import { AgentV4ToolGateway } from "./agent-v4-tool-gateway.js";
import { createPromptItems, createTaobaoSuitePlan, createVisualBible } from "./taobao-suite-planner.js";

export type AgentV4RequestContext = { tenantId: string; userId: string | null };
type V4GenerationExecutor = (input: { task: any; context: AgentV4RequestContext; tool: string; arguments: Record<string, unknown>; idempotencyKey: string }) => Promise<unknown>;
export function createV4WorkflowGenerationExecutor(adapter: { runNodes: (context: AgentV4RequestContext, input: { flowId: string; graphRevision: number; idempotencyKey: string; nodeIds: string[] }) => Promise<{ runs: Array<{ nodeId: string }> }> }): V4GenerationExecutor {
  return async ({ task, context, tool, arguments: args, idempotencyKey }) => {
    const nodeIds = tool === "image.generate_batch"
      ? (Array.isArray(args.items) ? args.items.flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).nodeId === "string" ? [(item as Record<string, unknown>).nodeId as string] : []) : [])
      : (typeof args.nodeId === "string" ? [args.nodeId] : []);
    if (!nodeIds.length) return { ok: false, status: "needs_review", taskId: task.id, errorCode: "AGENT_V4_NODE_ID_REQUIRED" };
    const launched = await adapter.runNodes(context, { flowId: task.flowId, graphRevision: task.graphRevision, idempotencyKey, nodeIds });
    return { ok: true, status: tool === "image.generate_batch" ? "generating_batch" : "generating_base", taskId: task.id, itemIds: launched.runs.map((run) => run.nodeId), summary: `${launched.runs.length} generation run(s) queued.` };
  };
}
export class AgentV4RuntimeService {
  constructor(private readonly options: { enabled: boolean; repository: AgentV4TaskRepository; session: { getSession: (context: AgentV4RequestContext, id: string) => Promise<{ tenantId?: string; projectId?: string | null; flowId?: string | null } | null> }; textRuntime: { streamText: (...args: any[]) => AsyncIterable<any> }; gateway?: AgentV4ToolGateway; generationExecutor?: V4GenerationExecutor }) {}
  private unavailable(): never { throw new AgentApiError(503, "AGENT_V4_UNAVAILABLE", "Canvas Agent V4 is not available."); }
  async startTurn(input: { sessionId: string; context: AgentV4RequestContext; body: unknown }) {
    if (!this.options.enabled) return this.unavailable();
    const session = await this.options.session.getSession(input.context, input.sessionId);
    if (!session || (session.tenantId && session.tenantId !== input.context.tenantId)) throw new AgentApiError(404, "AGENT_SESSION_NOT_FOUND", "Agent session was not found.");
    const body = agentV4TurnInputSchema.parse(input.body);
    if (!session.projectId || !session.flowId) throw new AgentApiError(400, "AGENT_PROJECT_FLOW_REQUIRED", "Agent session is not bound to a project and flow.");
    const store = new AgentV4TaskStore(this.options.repository);
    const task = await store.create({ tenantId: input.context.tenantId, sessionId: input.sessionId, projectId: session.projectId, flowId: session.flowId, graphRevision: body.expectedGraphRevision, prompt: body.prompt, idempotencyKey: body.idempotencyKey });
    const service = new AgentResponsesSessionService({ textRuntime: this.options.textRuntime, store, gateway: this.options.gateway ?? new AgentV4ToolGateway({ handlers: {
      "canvas.observe": async ({ task }) => ({ ok: true, status: "planning", taskId: task.id, summary: `Canvas ${task.flowId} observed at revision ${task.graphRevision}` }),
      "reference.inspect": async ({ call }) => ({ ok: true, status: "planning", assetIds: call.arguments.referenceAssetIds }),
      "product.analyze": async ({ call }) => ({ ok: true, status: "planning", summary: `商品主体分析完成。参考素材 ${Array.isArray(call.arguments.referenceAssetIds) ? call.arguments.referenceAssetIds.length : 0} 个；以实拍图中的外形、材质、颜色、结构和标识为不可改变特征。` }),
      "suite.plan": async ({ call }) => ({ ok: true, status: "preview_ready", suitePlan: createTaobaoSuitePlan({ mainImageCount: call.arguments.mainImageCount as number | undefined, detailPageCount: call.arguments.detailPageCount as number | undefined, prompt: call.arguments.prompt as string | undefined }) }),
      "visual_bible.create": async ({ call }) => ({ ok: true, status: "preview_ready", visualBible: createVisualBible(String(call.arguments.productSummary ?? "")) }),
      "prompt_set.create": async ({ call }) => ({ ok: true, status: "preview_ready", items: createPromptItems(call.arguments.suitePlan as ReturnType<typeof createTaobaoSuitePlan>, call.arguments.visualBible as ReturnType<typeof createVisualBible>, []) }),
      "image.generate_base": async ({ task, context, call, idempotencyKey }) => this.options.generationExecutor ? await this.options.generationExecutor({ task, context, tool: call.name, arguments: call.arguments, idempotencyKey }) : ({ ok: false, status: "needs_review", taskId: task.id, errorCode: "AGENT_V4_GENERATION_NOT_CONFIGURED", summary: "Generation runtime is not configured." }),
      "image.generate_batch": async ({ task, context, call, idempotencyKey }) => this.options.generationExecutor ? await this.options.generationExecutor({ task, context, tool: call.name, arguments: call.arguments, idempotencyKey }) : ({ ok: false, status: "needs_review", taskId: task.id, errorCode: "AGENT_V4_GENERATION_NOT_CONFIGURED", summary: "Generation runtime is not configured." }),
      "generation.continue": async ({ task, context, call, idempotencyKey }) => this.options.generationExecutor ? await this.options.generationExecutor({ task, context, tool: call.name, arguments: call.arguments, idempotencyKey }) : ({ ok: false, status: "needs_review", taskId: task.id, errorCode: "AGENT_V4_GENERATION_NOT_CONFIGURED", summary: "Generation runtime is not configured." }),
    } }) });
    return service.run({ task, context: input.context, prompt: body.prompt, safeContext: body.snapshot });
  }
  async replayEvents(input: { tenantId: string; taskId: string; afterSeq: number }) { if (!this.options.enabled) return this.unavailable(); return new AgentV4TaskStore(this.options.repository).listEvents(input); }
  async approve(_input?: unknown) { return this.unavailable(); }
  async cancel(_input?: unknown) { return this.unavailable(); }
  async retryItem(_input?: unknown) { return this.unavailable(); }
  async undo(_input?: unknown) { return this.unavailable(); }
}
