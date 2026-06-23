import type { WorkflowRunsService } from "../workflow-runs/workflow-runs.service.js";
import {
  buildAgentToolResultReferences,
  type AgentAssetReference,
} from "./agent-asset-references.js";

export type AgentWorkflowLaunchContext = {
  ipHash?: string | null;
  requestId?: string | null;
  tenantId: string;
  traceId?: string | null;
  userAgent?: string | null;
  userId: string | null;
};

export type AgentImageWorkflowLaunchInput = {
  flowId: string | null;
  prompt: string;
  referenceAssetIds?: string[];
  roundIndex: number;
  size?: "1K" | "2K" | "4K";
  targetNodeId: string | null;
  toolCallId: string;
  toolCallKey: string;
};

export type AgentImageWorkflowLaunchResult = {
  assetRefs: AgentAssetReference[];
  nodeRunId: string | null;
  status: "failed" | "succeeded";
  workflowRunId: string;
};

type WorkflowRunsServiceLike = Pick<WorkflowRunsService, "createWorkflowRun" | "getWorkflowRun">;

type WorkflowNodeRunLike = {
  id: string;
  nodeId: string;
  outputJson: Record<string, unknown> | null;
  status: string;
};

type WorkflowRunDetailsLike = {
  nodeRuns: WorkflowNodeRunLike[];
  workflowRun: {
    id: string;
    status: string;
  };
};

export class AgentWorkflowLauncherError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AgentWorkflowLauncherError";
    this.statusCode = statusCode;
  }
}

export class AgentWorkflowLauncher {
  constructor(private readonly options: {
    workflowRunsService: WorkflowRunsServiceLike;
  }) {}

  async launchImageGeneration(
    context: AgentWorkflowLaunchContext,
    input: AgentImageWorkflowLaunchInput,
  ): Promise<AgentImageWorkflowLaunchResult> {
    if (!input.flowId || !input.targetNodeId) {
      throw new AgentWorkflowLauncherError(
        400,
        "AGENT_WORKFLOW_TARGET_REQUIRED",
        "Agent image generation requires a runnable canvas target.",
      );
    }

    const created = await this.options.workflowRunsService.createWorkflowRun(context, input.flowId, {
      idempotencyKey: `agent:${input.toolCallId}:${input.toolCallKey}`,
      input: {
        agentTool: {
          prompt: input.prompt,
          referenceAssetIds: input.referenceAssetIds ?? [],
          size: input.size ?? null,
          toolCallId: input.toolCallId,
          toolCallKey: input.toolCallKey,
        },
        runMode: "target_node",
        targetNodeId: input.targetNodeId,
      },
    });

    const details = await this.options.workflowRunsService.getWorkflowRun(
      context,
      created.runId,
    ) as WorkflowRunDetailsLike;
    const targetNodeRun =
      details.nodeRuns.find((nodeRun) => nodeRun.nodeId === input.targetNodeId) ??
      details.nodeRuns[0] ??
      null;
    const assets = extractAssetsFromNodeRun(targetNodeRun);
    const references = buildAgentToolResultReferences({
      assets,
      roundIndex: input.roundIndex,
      status: details.workflowRun.status === "failed" ? "failed" : "succeeded",
      toolCallId: input.toolCallId,
    });

    return {
      assetRefs: references.assetRefs,
      nodeRunId: targetNodeRun?.id ?? null,
      status: references.status,
      workflowRunId: details.workflowRun.id,
    };
  }
}

function extractAssetsFromNodeRun(nodeRun: WorkflowNodeRunLike | null): Array<{
  assetId: string;
  height?: number | null;
  kind: "image" | "video";
  prompt?: string | null;
  width?: number | null;
}> {
  const assets = Array.isArray(nodeRun?.outputJson?.assets) ? nodeRun.outputJson.assets : [];
  return assets.flatMap((asset) => {
    if (!asset || typeof asset !== "object") return [];
    const value = asset as Record<string, unknown>;
    if (typeof value.assetId !== "string" || !value.assetId.trim()) return [];
    const kind = value.kind === "video" ? "video" : "image";
    return [{
      assetId: value.assetId.trim(),
      height: typeof value.height === "number" ? value.height : null,
      kind,
      prompt: typeof value.prompt === "string" ? value.prompt : null,
      width: typeof value.width === "number" ? value.width : null,
    }];
  });
}
