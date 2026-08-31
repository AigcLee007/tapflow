import { AgentApiError } from "../agent.service.js";
import { agentV4TurnInputSchema, parseV4ToolCall } from "./agent-v4-schemas.js";
import { AgentResponsesSessionService } from "./agent-responses-session.service.js";
import { AgentV4TaskStore, type AgentV4TaskRepository } from "./agent-v4-task-store.js";
import { AgentV4ToolGateway } from "./agent-v4-tool-gateway.js";
import { safeToolResult } from "./agent-v4-types.js";
import { createPromptItems, createTaobaoSuitePlan, createVisualBible } from "./taobao-suite-planner.js";
import { buildV4DeliveryOperationSet, commitV4Delivery, verifyV4Delivery } from "./agent-delivery-commit.js";
import type { AppliedCanvasOperationSet, CanvasOperationService } from "../v3/canvas-operation-service.js";
import type { CanvasOperation, CanvasOperationEnvelope } from "../v3/canvas-operation-schema.js";

export type AgentV4RequestContext = { tenantId: string; userId: string | null };
type V4GenerationExecutor = (input: { task: any; context: AgentV4RequestContext; tool: string; arguments: Record<string, unknown>; idempotencyKey: string }) => Promise<unknown>;
export function createV4WorkflowGenerationExecutor(adapter: { runNodes: (context: AgentV4RequestContext, input: { flowId: string; graphRevision: number; idempotencyKey: string; nodeIds: string[]; agentV4TaskId?: string; agentV4ItemIds?: Record<string, string> }) => Promise<{ runs: Array<{ nodeId: string; runId: string }> }> }): V4GenerationExecutor {
  return async ({ task, context, tool, arguments: args, idempotencyKey }) => {
    const nodeIds = tool === "image.generate_batch"
      ? (Array.isArray(args.items) ? args.items.flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).nodeId === "string" ? [(item as Record<string, unknown>).nodeId as string] : []) : [])
      : (typeof args.nodeId === "string" ? [args.nodeId] : []);
    if (!nodeIds.length) return { ok: false, status: "needs_review", taskId: task.id, errorCode: "AGENT_V4_NODE_ID_REQUIRED" };
    const agentV4ItemIds = Object.fromEntries((Array.isArray(args.items) ? args.items : []).flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).nodeId === "string" && typeof (item as Record<string, unknown>).itemId === "string" ? [[(item as Record<string, unknown>).nodeId as string, (item as Record<string, unknown>).itemId as string]] : []));
    const launched = await adapter.runNodes(context, { flowId: task.flowId, graphRevision: task.graphRevision, idempotencyKey, nodeIds, agentV4TaskId: task.id, agentV4ItemIds });
    return { ok: true, status: tool === "image.generate_batch" ? "generating_batch" : "generating_base", taskId: task.id, itemIds: launched.runs.map((run) => run.nodeId), runIds: launched.runs.map((run) => run.runId), summary: `${launched.runs.length} generation run(s) queued.` };
  };
}
export class AgentV4RuntimeService {
  constructor(private readonly options: { enabled: boolean; repository: AgentV4TaskRepository; session: { getSession: (context: AgentV4RequestContext, id: string) => Promise<{ tenantId?: string; projectId?: string | null; flowId?: string | null } | null> }; textRuntime: { streamText: (...args: any[]) => AsyncIterable<any> }; gateway?: AgentV4ToolGateway; generationExecutor?: V4GenerationExecutor; canvasOperations?: Pick<CanvasOperationService, "applyApprovedOperationSet"> }) {}
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
  private async getTask(input: { taskId: string; context: AgentV4RequestContext }) {
    if (!this.options.repository.getTask) throw new AgentApiError(503, "AGENT_V4_TASK_STORE_UNAVAILABLE", "V4 task store is not available.");
    const task = await this.options.repository.getTask({ tenantId: input.context.tenantId, taskId: input.taskId });
    if (!task) throw new AgentApiError(404, "AGENT_TASK_NOT_FOUND", "Agent task was not found.");
    return task;
  }
  async approve(input: { taskId: string; context: AgentV4RequestContext; approved: boolean }) {
    if (!this.options.enabled) return this.unavailable();
    const task = await this.getTask(input); const store = new AgentV4TaskStore(this.options.repository);
    if (!input.approved) { await store.update(task, { status: "cancelled", errorJson: { code: "AGENT_APPROVAL_REJECTED" } }); return { taskId: task.id, status: "cancelled" }; }
    if (task.status !== "waiting_for_approval") throw new AgentApiError(409, "AGENT_V4_APPROVAL_STATE_INVALID", "Task is not waiting for approval.");
    const pending = task.outputJson?.pendingTool;
    if (!pending || typeof pending !== "object") throw new AgentApiError(409, "AGENT_V4_PENDING_OPERATION_MISSING", "Task has no approved operation to resume.");
    let call;
    try {
      call = parseV4ToolCall({ name: (pending as Record<string, unknown>).name as string, arguments: (pending as Record<string, unknown>).arguments });
    } catch {
      throw new AgentApiError(409, "AGENT_V4_PENDING_OPERATION_INVALID", "Task has no valid operation to resume.");
    }
    const initialStatus = call.name === "canvas.commit_operations" ? "verifying" : call.name === "image.generate_batch" ? "generating_batch" : "generating_base";
    await store.append(task, { type: "approval_granted", status: initialStatus, idempotencyKey: `v4:${task.id}:approval:granted`, payload: { taskId: task.id } });
    await store.update(task, { status: initialStatus });
    const rawResult = call.name === "canvas.commit_operations"
      ? await this.commitCanvasDelivery({ taskId: task.id, context: input.context, expectedRevision: call.arguments.expectedRevision as number })
      : this.options.generationExecutor
        ? await this.options.generationExecutor({ task, context: input.context, tool: call.name, arguments: call.arguments, idempotencyKey: `v4:${task.id}:approved:${call.name}` })
        : { ok: false, status: "needs_review", taskId: task.id, errorCode: "AGENT_V4_GENERATION_NOT_CONFIGURED" };
    const result = safeToolResult(rawResult);
    const status = result.status ?? "needs_review";
    await store.append(task, { type: "generation_started", status, idempotencyKey: `v4:${task.id}:approved:${call.name}`, payload: result });
    await store.update(task, { status, outputJson: { ...result } });
    return { taskId: task.id, status, ...result };
  }
  async cancel(input: { taskId: string; context: AgentV4RequestContext }) {
    if (!this.options.enabled) return this.unavailable();
    const task = await this.getTask(input); if (["succeeded", "failed", "cancelled"].includes(task.status)) return { taskId: task.id, status: task.status };
    const store = new AgentV4TaskStore(this.options.repository); await store.append(task, { type: "cancelled", status: "cancelled", idempotencyKey: `v4:${task.id}:cancel`, payload: { taskId: task.id } }); await store.update(task, { status: "cancelled", errorJson: { code: "AGENT_TASK_CANCELLED" } }); return { taskId: task.id, status: "cancelled" };
  }
  async retryItem(input: { taskId: string; context: AgentV4RequestContext; itemId: string; idempotencyKey?: string }) {
    if (!this.options.enabled) return this.unavailable();
    const task = await this.getTask(input); if (!["partial_success", "failed", "needs_review"].includes(task.status)) throw new AgentApiError(409, "AGENT_V4_RETRY_STATE_INVALID", "Task has no retryable failed item.");
    if (!this.options.repository.findGenerationItem || !this.options.repository.updateGenerationItem) throw new AgentApiError(503, "AGENT_V4_GENERATION_STORE_UNAVAILABLE", "Generation item storage is not available.");
    const item = await this.options.repository.findGenerationItem({ tenantId: input.context.tenantId, taskId: task.id, itemId: input.itemId });
    if (!item || item.status !== "failed") throw new AgentApiError(409, "AGENT_V4_ITEM_NOT_RETRYABLE", "Only failed generation items can be retried.");
    const retryCount = (item.retryCount ?? 0) + 1;
    if (retryCount > 3) throw new AgentApiError(409, "AGENT_V4_RETRY_LIMIT_EXCEEDED", "The generation item has reached its retry limit.");
    const idempotencyKey = input.idempotencyKey ?? `v4:${task.id}:retry:${input.itemId}:${retryCount}`;
    const store = new AgentV4TaskStore(this.options.repository);
    await this.options.repository.updateGenerationItem({ tenantId: input.context.tenantId, taskId: task.id, itemId: item.itemId, patch: { status: "queued", retryCount, errorCode: undefined, assetId: undefined, workflowRunId: undefined } });
    await store.append(task, { type: "item_retry_requested", status: "repairing", idempotencyKey, payload: { itemId: item.itemId, retryCount } });
    await store.update(task, { status: "repairing" });
    const rawResult = this.options.generationExecutor
      ? await this.options.generationExecutor({ task, context: input.context, tool: "image.generate_batch", arguments: { items: [{ itemId: item.itemId, pageKey: item.pageKey, prompt: item.prompt, referenceAssetIds: item.referenceAssetIds, ...(item.nodeId ? { nodeId: item.nodeId } : {}) }] }, idempotencyKey })
      : { ok: false, status: "needs_review", taskId: task.id, errorCode: "AGENT_V4_GENERATION_NOT_CONFIGURED" };
    const result = safeToolResult(rawResult);
    const status = result.ok ? (result.status ?? "generating_batch") : "needs_review";
    const workflowRunId = result.runIds?.[0];
    if (workflowRunId) {
      await this.options.repository.updateGenerationItem({ tenantId: input.context.tenantId, taskId: task.id, itemId: item.itemId, patch: { workflowRunId, status: "running" } });
    }
    await store.append(task, { type: "item_retry_started", status, idempotencyKey: `${idempotencyKey}:started`, payload: { itemId: item.itemId, retryCount, ...result } });
    await store.update(task, { status });
    return { taskId: task.id, status, itemId: item.itemId, retryCount, ...result };
  }
  async commitCanvasDelivery(input: { taskId: string; context: AgentV4RequestContext; expectedRevision: number }) {
    if (!this.options.enabled) return this.unavailable();
    if (!this.options.canvasOperations) throw new AgentApiError(503, "AGENT_V4_CANVAS_OPERATIONS_UNAVAILABLE", "Canvas delivery is not configured.");
    const task = await this.getTask(input);
    const generationItems = Array.isArray(task.outputJson?.generationItems) ? task.outputJson.generationItems : [];
    const expected = generationItems.flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).itemId === "string" ? [{ id: (item as Record<string, unknown>).itemId as string, kind: "image" }] : []);
    const actual = generationItems.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const source = item as Record<string, unknown>;
      if (typeof source.itemId !== "string" || typeof source.status !== "string") return [];
      return [{ id: source.itemId, kind: "image", status: source.status, ...(typeof source.assetId === "string" ? { assetId: source.assetId } : {}), ...(typeof source.nodeId === "string" ? { nodeId: source.nodeId } : {}), tenantId: task.tenantId, flowId: task.flowId }];
    });
    const delivery = verifyV4Delivery({ tenantId: task.tenantId, taskId: task.id, flowId: task.flowId, expected, actual });
    if (delivery.status !== "verified") throw new AgentApiError(409, "AGENT_V4_DELIVERY_NOT_VERIFIED", "All generation items require verified asset delivery before committing.");
    const operationSet = buildV4DeliveryOperationSet({ taskId: task.id, baseRevision: input.expectedRevision, delivery });
    let applied: AppliedCanvasOperationSet;
    try {
      applied = await commitV4Delivery(this.options.canvasOperations as CanvasOperationService, { tenantId: task.tenantId, projectId: task.projectId, flowId: task.flowId, taskId: task.id, operationSet, delivery });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AGENT_V4_CANVAS_COMMIT_FAILED";
      throw new AgentApiError(message.includes("REVISION_CONFLICT") ? 409 : 400, message, "Canvas delivery could not be committed.");
    }
    const store = new AgentV4TaskStore(this.options.repository);
    const appliedCanvas = { operationSetId: operationSet.operationSetId, revision: applied.revision, inverseOperations: applied.inverseOperations };
    await store.append(task, { type: "canvas_delivery_committed", status: "succeeded", idempotencyKey: `v4:${task.id}:canvas:${operationSet.operationSetId}`, payload: { taskId: task.id, revision: applied.revision, operationSetId: operationSet.operationSetId, appliedCanvas } });
    await store.update(task, { status: "succeeded", outputJson: { ...(task.outputJson ?? {}), appliedCanvas } });
    return { taskId: task.id, status: "succeeded", revision: applied.revision, operationSetId: operationSet.operationSetId };
  }
  async undo(input: { taskId: string; context: AgentV4RequestContext; expectedRevision: number }) {
    if (!this.options.enabled) return this.unavailable();
    if (!this.options.canvasOperations) throw new AgentApiError(503, "AGENT_V4_CANVAS_OPERATIONS_UNAVAILABLE", "Canvas delivery is not configured.");
    const task = await this.getTask(input);
    const appliedCanvas = task.outputJson?.appliedCanvas;
    const inverseOperations = appliedCanvas && typeof appliedCanvas === "object" && Array.isArray((appliedCanvas as Record<string, unknown>).inverseOperations) ? (appliedCanvas as Record<string, unknown>).inverseOperations as CanvasOperation[] : [];
    if (!inverseOperations.length) throw new AgentApiError(409, "AGENT_V4_INVERSE_OPERATIONS_MISSING", "No verified inverse canvas operations are available for this task.");
    const operationSet: CanvasOperationEnvelope = { operationSetId: `v4:${task.id}:undo:${input.expectedRevision}`, taskId: task.id, turnId: task.id, baseRevision: input.expectedRevision, summary: "Undo Canvas Agent V4 delivery", risk: "safe", requiresApproval: false, preconditions: [], expectedEffects: [], operations: inverseOperations };
    let applied: AppliedCanvasOperationSet;
    try {
      applied = await this.options.canvasOperations.applyApprovedOperationSet({ tenantId: task.tenantId, projectId: task.projectId, flowId: task.flowId, taskId: task.id, operationSet });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AGENT_V4_CANVAS_UNDO_FAILED";
      throw new AgentApiError(message.includes("REVISION_CONFLICT") ? 409 : 400, message, "Canvas delivery could not be undone.");
    }
    const store = new AgentV4TaskStore(this.options.repository);
    const nextAppliedCanvas = { operationSetId: operationSet.operationSetId, revision: applied.revision, undone: true };
    await store.append(task, { type: "canvas_delivery_undone", status: "succeeded", idempotencyKey: `v4:${task.id}:canvas-undo:${input.expectedRevision}`, payload: { taskId: task.id, revision: applied.revision, operationSetId: operationSet.operationSetId } });
    await store.update(task, { status: "succeeded", outputJson: { ...(task.outputJson ?? {}), appliedCanvas: nextAppliedCanvas } });
    return { taskId: task.id, status: "succeeded", revision: applied.revision, operationSetId: operationSet.operationSetId };
  }
}
