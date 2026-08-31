import { AgentApiError } from "../agent.service.js";
import type { AgentV3TaskRepository } from "./agent-v3-task-store.js";
import { AgentV3TaskStore } from "./agent-v3-task-store.js";
import type { AgentService } from "../agent.service.js";
import type { CreateAgentTurnInput } from "../agent.schemas.js";
import { verifyTaskDelivery } from "./agent-delivery-verifier.js";

export type AgentV3TurnInput = {
  prompt: string;
  [key: string]: unknown;
};

export type AgentV3RequestContext = { tenantId: string; userId: string | null };

export type AgentV3RuntimeAdapter = {
  startTurn(input: {
    sessionId: string;
    input: AgentV3TurnInput;
    context?: AgentV3RequestContext;
    writeChunk: (chunk: string) => void | Promise<void>;
  }): Promise<unknown>;
  approve?(input: { taskId: string; context: AgentV3RequestContext; approved: boolean; writeChunk: (chunk: string) => void | Promise<void> }): Promise<unknown>;
  cancel?(input: { taskId: string; context: AgentV3RequestContext }): Promise<unknown>;
  retryStep?(input: { taskId: string; context: AgentV3RequestContext; stepId: string }): Promise<unknown>;
};

export class AgentV3RuntimeService {
  private readonly enabled: boolean;
  private readonly adapter: AgentV3RuntimeAdapter | null;

  constructor(options: { enabled: boolean; adapter?: AgentV3RuntimeAdapter | null; repository?: { getEvents?: AgentV3TaskRepository["getEvents"] } | null }) {
    this.enabled = options.enabled;
    this.adapter = options.adapter ?? null;
    this.repository = options.repository ?? null;
  }

  private readonly repository: { getEvents?: AgentV3TaskRepository["getEvents"] } | null;

  async startTurn(input: Parameters<AgentV3RuntimeAdapter["startTurn"]>[0]): Promise<unknown> {
    if (!this.enabled || !this.adapter) {
      throw Object.assign(new AgentApiError(503, "AGENT_V3_UNAVAILABLE", "Canvas Agent V3 is not available."), { statusCode: 503 });
    }
    return this.adapter.startTurn(input);
  }

  async replayEvents(input: { tenantId: string; taskId: string; afterSeq: number }) {
    if (!this.enabled || !this.repository?.getEvents) {
      throw Object.assign(new AgentApiError(503, "AGENT_V3_EVENT_REPLAY_UNAVAILABLE", "Canvas Agent V3 event replay is not available."), { statusCode: 503 });
    }
    return this.repository.getEvents(input);
  }

  async approve(input: { taskId: string; context: AgentV3RequestContext; approved: boolean; writeChunk?: (chunk: string) => void | Promise<void> }) {
    if (!this.enabled || !this.adapter?.approve) throw Object.assign(new AgentApiError(503, "AGENT_V3_APPROVAL_UNAVAILABLE", "Canvas Agent V3 approval is not available."), { statusCode: 503 });
    return this.adapter.approve({ ...input, writeChunk: input.writeChunk ?? (() => undefined) });
  }

  async cancel(input: { taskId: string; context: AgentV3RequestContext }) {
    if (!this.enabled || !this.adapter?.cancel) throw Object.assign(new AgentApiError(503, "AGENT_V3_CANCEL_UNAVAILABLE", "Canvas Agent V3 cancellation is not available."), { statusCode: 503 });
    return this.adapter.cancel(input);
  }

  async retryStep(input: { taskId: string; context: AgentV3RequestContext; stepId: string }) {
    if (!this.enabled || !this.adapter?.retryStep) throw Object.assign(new AgentApiError(503, "AGENT_V3_RETRY_UNAVAILABLE", "Canvas Agent V3 retry is not available."), { statusCode: 503 });
    return this.adapter.retryStep(input);
  }
}

export function createAgentV3PlanningAdapter(agentService: AgentService, repository: AgentV3TaskRepository): AgentV3RuntimeAdapter {
  const store = new AgentV3TaskStore(repository);
  return {
    async startTurn(request) {
      if (!request.context) throw new AgentApiError(400, "TENANT_REQUIRED", "Current request is missing tenant context.");
      const input = request.input as unknown as CreateAgentTurnInput;
      const session = await agentService.sessionRepository.getSession(request.context, request.sessionId);
      if (!session.flowId || input.snapshot.flowId !== session.flowId || (session.projectId && input.snapshot.projectId !== session.projectId)) {
        throw new AgentApiError(400, "AGENT_CANVAS_FLOW_MISMATCH", "Agent session is not bound to the requested flow.");
      }
      const draft = await agentService.flowsService.getFlowDraft(request.context, session.flowId);
      if (input.expectedGraphRevision !== undefined && input.expectedGraphRevision !== draft.revision) {
        throw new AgentApiError(409, "FLOW_DRAFT_REVISION_CONFLICT", "画布已被其他修改，请刷新后重试。");
      }
      const projectId = session.projectId ?? input.snapshot.projectId;
      if (!projectId) throw new AgentApiError(400, "AGENT_PROJECT_REQUIRED", "Agent session is not bound to a project.");
      const task = await store.create({ tenantId: request.context.tenantId, sessionId: request.sessionId, projectId, flowId: session.flowId, graphRevision: draft.revision, prompt: input.prompt, idempotencyKey: input.idempotencyKey });
      const emit = async (type: string, status: string, payload: Record<string, unknown> = {}) => {
        await store.append(task, { type, status, payload });
        await request.writeChunk(`event: event\\ndata: ${JSON.stringify({ taskId: task.id, type, status, ...payload })}\\n\\n`);
      };
      await emit("observation", "observing", { graphRevision: draft.revision });
      const plan = await agentService.plannerService.planWithLlm(request.context, input.prompt, input.snapshot);
      await emit("plan", "planning", { plan: plan.plan, evidence: plan.evidence, costEstimate: plan.costEstimate ?? null });
      await emit("preview", "preview_ready", { operations: plan.proposedOps, requiresApproval: plan.approvalRequired, taskId: task.id });
      const status = plan.approvalRequired ? "waiting_for_approval" : "needs_review";
      await repository.updateTask?.(task.id, { tenantId: request.context.tenantId, status, outputJson: { plan: plan.plan, proposedOps: plan.proposedOps, costEstimate: plan.costEstimate ?? null } });
      return { taskId: task.id, status };
    },
    async approve(request) {
      if (!repository.getTask) throw new AgentApiError(503, "AGENT_V3_APPROVAL_UNAVAILABLE", "Canvas Agent V3 approval is not available.");
      const task = await repository.getTask({ tenantId: request.context.tenantId, taskId: request.taskId });
      if (!task) throw new AgentApiError(404, "AGENT_TASK_NOT_FOUND", "Agent task was not found.");
      if (!request.approved) { await repository.updateTask?.(task.id, { tenantId: request.context.tenantId, status: "cancelled", errorJson: { code: "AGENT_APPROVAL_REJECTED" } }); return { taskId: task.id, status: "cancelled" }; }
      const flowId = typeof task.inputJson.flowId === "string" ? task.inputJson.flowId : null;
      const graphRevision = typeof task.inputJson.graphRevision === "number" ? task.inputJson.graphRevision : null;
      const runNodeIds = Array.isArray(task.outputJson.proposedOps)
        ? task.outputJson.proposedOps.flatMap((operation) => operation && typeof operation === "object" && (operation as Record<string, unknown>).type === "run_node" && typeof (operation as Record<string, unknown>).nodeId === "string" ? [(operation as Record<string, unknown>).nodeId as string] : [])
        : [];
      if (flowId && graphRevision !== null && runNodeIds.length && agentService.workflowRunAdapter) {
        const launched = await agentService.workflowRunAdapter.runNodes(request.context, { flowId, graphRevision, idempotencyKey: `v3:${task.id}:approve`, nodeIds: runNodeIds });
        await repository.updateTask?.(task.id, { tenantId: request.context.tenantId, status: "running", outputJson: { workflowRuns: launched.runs.map((run) => ({ nodeId: run.nodeId, runId: run.runId })) } });
        await request.writeChunk(`event: event\\ndata: ${JSON.stringify({ taskId: task.id, type: "run_started", status: "running", workflowRuns: launched.runs })}\\n\\n`);
        const terminal = await agentService.workflowRunAdapter.awaitResults(request.context, launched.runs.map((run) => run.runId));
        if (!terminal.allTerminal) return { taskId: task.id, status: "running", workflowRuns: launched.runs };
        if (!agentService.workflowRunAdapter.getDeliveryActuals) {
          await repository.updateTask?.(task.id, { tenantId: request.context.tenantId, status: "needs_review", errorJson: { code: "DELIVERY_DETAILS_UNAVAILABLE" } });
          return { taskId: task.id, status: "needs_review", workflowRuns: launched.runs };
        }
        const actual = await agentService.workflowRunAdapter.getDeliveryActuals(request.context, launched.runs.map((run) => run.runId));
        const delivery = verifyTaskDelivery({ tenantId: request.context.tenantId, taskId: task.id, flowId, expected: launched.runs.map((run) => ({ id: run.runId, kind: "image" })), actual });
        const status = delivery.status === "verified" ? "succeeded" : delivery.status === "partial" ? "partial_success" : delivery.status === "waiting" ? "needs_review" : "failed";
        await repository.updateTask?.(task.id, { tenantId: request.context.tenantId, status, outputJson: { workflowRuns: launched.runs, delivery } });
        await request.writeChunk(`event: event\\ndata: ${JSON.stringify({ taskId: task.id, type: "delivery_verified", status, delivery })}\\n\\n`);
        return { taskId: task.id, status, workflowRuns: launched.runs, delivery };
      }
      await repository.updateTask?.(task.id, { tenantId: request.context.tenantId, status: "running" });
      await request.writeChunk(`event: event\\ndata: ${JSON.stringify({ taskId: task.id, type: "approval_granted", status: "running" })}\\n\\n`);
      return { taskId: task.id, status: "running" };
    },
    async cancel(request) {
      if (!repository.getTask || !repository.updateTask) throw new AgentApiError(503, "AGENT_V3_CANCEL_UNAVAILABLE", "Canvas Agent V3 cancellation is not available.");
      const task = await repository.getTask({ tenantId: request.context.tenantId, taskId: request.taskId });
      if (!task) throw new AgentApiError(404, "AGENT_TASK_NOT_FOUND", "Agent task was not found.");
      if (["succeeded", "failed", "cancelled"].includes(task.status)) return { taskId: task.id, status: task.status };
      await repository.updateTask(task.id, { tenantId: request.context.tenantId, status: "cancelled", errorJson: { code: "AGENT_TASK_CANCELLED" } });
      return { taskId: task.id, status: "cancelled" };
    },
    async retryStep(request) {
      if (!repository.getTask || !agentService.workflowRunAdapter) throw new AgentApiError(503, "AGENT_V3_RETRY_UNAVAILABLE", "Canvas Agent V3 retry is not available.");
      const task = await repository.getTask({ tenantId: request.context.tenantId, taskId: request.taskId });
      if (!task) throw new AgentApiError(404, "AGENT_TASK_NOT_FOUND", "Agent task was not found.");
      const flowId = typeof task.inputJson.flowId === "string" ? task.inputJson.flowId : null;
      const graphRevision = typeof task.inputJson.graphRevision === "number" ? task.inputJson.graphRevision : null;
      if (!flowId || graphRevision === null) throw new AgentApiError(409, "AGENT_RETRY_CONTEXT_MISSING", "Agent retry context is missing.");
      const failedNode = typeof request.stepId === "string" && request.stepId.trim() ? request.stepId.trim() : null;
      if (!failedNode) throw new AgentApiError(400, "AGENT_RETRY_STEP_REQUIRED", "A failed step is required.");
      const launched = await agentService.workflowRunAdapter.runNodes(request.context, { flowId, graphRevision, idempotencyKey: `v3:${task.id}:retry:${failedNode}`, nodeIds: [failedNode] });
      await repository.updateTask?.(task.id, { tenantId: request.context.tenantId, status: "running", outputJson: { retryStepId: failedNode, workflowRuns: launched.runs } });
      return { taskId: task.id, status: "running", retriedStepId: failedNode, workflowRuns: launched.runs };
    },
  };
}
