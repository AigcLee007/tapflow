import type { WorkflowRunsService } from "../../workflow-runs/workflow-runs.service.js";

type Context = { tenantId: string; userId: string | null; requestId?: string | null; traceId?: string | null; ipHash?: string | null; userAgent?: string | null };

export class V2WorkflowRunAdapter {
  constructor(private readonly options: {
    getFlowRevision: (context: Context, flowId: string) => Promise<number>;
    workflowRuns: Pick<WorkflowRunsService, "createWorkflowRun"> & Partial<Pick<WorkflowRunsService, "getWorkflowRunStatus" | "getWorkflowRun">>;
  }) {}

  async runNodes(context: Context, input: { flowId: string; graphRevision: number; idempotencyKey: string; nodeIds: string[]; skillRunId?: string; skillVersionId?: string; skillStepIds?: Record<string, string> }) {
    const revision = await this.options.getFlowRevision(context, input.flowId);
    if (revision !== input.graphRevision) throw new Error("FLOW_DRAFT_REVISION_CONFLICT");
    const runs = [];
    for (const nodeId of input.nodeIds) {
      const created = await this.options.workflowRuns.createWorkflowRun(context, input.flowId, {
        idempotencyKey: `v2:${input.idempotencyKey}:${nodeId}`,
        input: {
          agentSkillRunId: input.skillRunId ?? null,
          agentSkillStepId: input.skillStepIds?.[nodeId] ?? null,
          agentSkillVersionId: input.skillVersionId ?? null,
          runMode: "target_node",
          targetNodeId: nodeId,
        },
      });
      runs.push({ nodeId, runId: created.runId, status: created.status });
    }
    return { revision, runs };
  }

  async awaitResults(context: Context, runIds: string[]) {
    if (!this.options.workflowRuns.getWorkflowRunStatus) throw new Error("WORKFLOW_STATUS_READER_NOT_CONFIGURED");
    const uniqueRunIds = Array.from(new Set(runIds.map((id) => id.trim()).filter(Boolean))).slice(0, 12);
    const getStatus = this.options.workflowRuns.getWorkflowRunStatus;
    const runs = await Promise.all(uniqueRunIds.map((runId) => getStatus(context, runId)));
    const terminal = new Set(["succeeded", "failed", "cancelled"]);
    return { allTerminal: runs.every((run) => terminal.has(run.status)), runs };
  }

  async getDeliveryActuals(context: Context, runIds: string[]) {
    if (!this.options.workflowRuns.getWorkflowRun) throw new Error("WORKFLOW_DETAILS_READER_NOT_CONFIGURED");
    const details = await Promise.all(Array.from(new Set(runIds)).map((runId) => this.options.workflowRuns.getWorkflowRun!(context, runId)));
    return details.flatMap((detail) => detail.nodeRuns.map((nodeRun) => ({
      id: detail.workflowRun.id,
      kind: nodeRun.nodeType,
      status: detail.workflowRun.status === "succeeded" && nodeRun.status === "succeeded" ? "succeeded" : nodeRun.status,
      nodeId: nodeRun.nodeId,
      assetId: typeof nodeRun.outputJson?.assetId === "string" ? nodeRun.outputJson.assetId : undefined,
      text: typeof nodeRun.outputJson?.text === "string" ? nodeRun.outputJson.text : undefined,
      tenantId: detail.workflowRun.tenantId,
      flowId: detail.workflowRun.flowId,
    })));
  }
}
