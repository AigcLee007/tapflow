import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { Pool } from "pg";

import type { AgentGenerationCostEstimate } from "./agent-cost-estimator.js";
import type { AgentAssetReference } from "./agent-asset-references.js";
import type { ParsedAgentToolCall } from "./agent-tool-schemas.js";
import type {
  AgentImageWorkflowLaunchResult,
  AgentWorkflowLaunchContext,
  AgentWorkflowLauncher,
} from "./agent-workflow-launcher.js";

export type AgentToolExecutionTarget = {
  flowId: string | null;
  targetNodeId: string | null;
};

export type AgentToolRunInput = {
  call: ParsedAgentToolCall;
  costEstimate?: AgentGenerationCostEstimate | null;
  executionTarget: AgentToolExecutionTarget;
  roundIndex: number;
  sessionId: string;
  turnId: string;
};

export type AgentToolRunResult = {
  assetRefs: AgentAssetReference[];
  failures: Array<{
    code: string;
    message: string;
    toolCallKey: string;
  }>;
  status: "failed" | "partial_success" | "succeeded";
  toolCallId: string;
  workflowRunIds: string[];
};

type AgentToolCallCreateInput = {
  argumentsJson: Record<string, unknown>;
  costEstimateJson?: Record<string, unknown>;
  createdBy: string | null;
  sessionId: string;
  status: string;
  tenantId: string;
  toolCallKey: string;
  toolName: string;
  turnId: string;
};

type AgentToolCallUpdateInput = {
  errorJson?: Record<string, unknown> | null;
  resultJson?: Record<string, unknown>;
  status: string;
  tenantId: string;
  workflowRunId?: string | null;
  nodeRunId?: string | null;
};

type AgentToolRunnerRepository = {
  createToolCall(input: AgentToolCallCreateInput): Promise<{ id: string }>;
  updateToolCall(id: string, input: AgentToolCallUpdateInput): Promise<void>;
};

type AgentWorkflowLauncherLike = Pick<AgentWorkflowLauncher, "launchImageGeneration">;

export class DatabaseAgentToolRunnerRepository implements AgentToolRunnerRepository {
  readonly pool: Pool;

  constructor(options?: { pool?: Pool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async createToolCall(input: AgentToolCallCreateInput): Promise<{ id: string }> {
    return withTenantTransaction({ tenantId: input.tenantId, userId: input.createdBy }, async (client) => {
      const result = await client.query<{ id: string }>(
        `
          INSERT INTO agent_tool_calls (
            tenant_id,
            session_id,
            turn_id,
            tool_call_key,
            tool_name,
            permission_level,
            status,
            arguments_json,
            input_json,
            cost_estimate_json,
            created_by,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'credit_required', $6, $7::jsonb, $7::jsonb, $8::jsonb, $9::uuid, now())
          RETURNING id::text AS id
        `,
        [
          input.tenantId,
          input.sessionId,
          input.turnId,
          input.toolCallKey,
          input.toolName,
          input.status,
          JSON.stringify(input.argumentsJson),
          JSON.stringify(input.costEstimateJson ?? {}),
          input.createdBy,
        ],
      );
      return result.rows[0]!;
    }, this.pool);
  }

  async updateToolCall(id: string, input: AgentToolCallUpdateInput): Promise<void> {
    await withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      await client.query(
        `
          UPDATE agent_tool_calls
          SET
            status = $2,
            result_json = COALESCE($3::jsonb, result_json),
            output_json = COALESCE($3::jsonb, output_json),
            error_json = $4::jsonb,
            workflow_run_id = COALESCE($5::uuid, workflow_run_id),
            node_run_id = COALESCE($6::uuid, node_run_id),
            started_at = CASE WHEN $2 = 'running' THEN COALESCE(started_at, now()) ELSE started_at END,
            finished_at = CASE WHEN $2 IN ('succeeded', 'failed', 'cancelled', 'skipped') THEN now() ELSE finished_at END,
            updated_at = now()
          WHERE id = $1::uuid
        `,
        [
          id,
          input.status,
          input.resultJson ? JSON.stringify(input.resultJson) : null,
          input.errorJson ? JSON.stringify(input.errorJson) : null,
          input.workflowRunId ?? null,
          input.nodeRunId ?? null,
        ],
      );
    }, this.pool);
  }
}

export class AgentToolRunner {
  constructor(private readonly options: {
    launcher: AgentWorkflowLauncherLike;
    repository: AgentToolRunnerRepository;
  }) {}

  async runToolCall(
    context: AgentWorkflowLaunchContext,
    input: AgentToolRunInput,
  ): Promise<AgentToolRunResult> {
    const record = await this.options.repository.createToolCall({
      argumentsJson: input.call.arguments,
      costEstimateJson: input.costEstimate as Record<string, unknown> | undefined,
      createdBy: context.userId,
      sessionId: input.sessionId,
      status: "planned",
      tenantId: context.tenantId,
      toolCallKey: input.call.toolCallKey,
      toolName: input.call.toolName,
      turnId: input.turnId,
    });

    await this.options.repository.updateToolCall(record.id, { status: "running", tenantId: context.tenantId });

    try {
      let launched: Array<AgentImageWorkflowLaunchResult | { error: { code: string; message: string; toolCallKey: string } }> = [];
      if (input.call.toolName === "generate_image") {
        launched = [
          await this.launchOne(
            context,
            input,
            record.id,
            input.call.arguments.prompt,
            input.call.arguments.size,
            input.call.arguments.referenceRefs,
          ),
        ];
      } else if (input.call.toolName === "generate_image_batch") {
        launched = await this.launchBatch(context, input as AgentToolRunInput & {
          call: Extract<ParsedAgentToolCall, { toolName: "generate_image_batch" }>;
        }, record.id);
      }

      const successes = launched.filter((result): result is AgentImageWorkflowLaunchResult => !("error" in result));
      const failures = launched.flatMap((result) => "error" in result ? [result.error] : []);
      const assetRefs = successes.flatMap((result) => result.assetRefs);
      const status = failures.length === 0 ? "succeeded" : successes.length > 0 ? "partial_success" : "failed";
      const resultJson = {
        assetRefs,
        failures,
        status,
        workflowRunIds: successes.map((result) => result.workflowRunId),
      };

      await this.options.repository.updateToolCall(record.id, {
        resultJson,
        status: status === "failed" ? "failed" : "succeeded",
        tenantId: context.tenantId,
        workflowRunId: successes[0]?.workflowRunId ?? null,
        nodeRunId: successes[0]?.nodeRunId ?? null,
      });

      return {
        assetRefs,
        failures,
        status,
        toolCallId: record.id,
        workflowRunIds: successes.map((result) => result.workflowRunId),
      };
    } catch (error) {
      const normalized = normalizeToolError(error);
      await this.options.repository.updateToolCall(record.id, {
        errorJson: normalized,
        status: "failed",
        tenantId: context.tenantId,
      });
      return {
        assetRefs: [],
        failures: [{ ...normalized, toolCallKey: input.call.toolCallKey }],
        status: "failed",
        toolCallId: record.id,
        workflowRunIds: [],
      };
    }
  }

  private async launchBatch(
    context: AgentWorkflowLaunchContext,
    input: AgentToolRunInput & { call: Extract<ParsedAgentToolCall, { toolName: "generate_image_batch" }> },
    toolCallId: string,
  ): Promise<Array<AgentImageWorkflowLaunchResult | { error: { code: string; message: string; toolCallKey: string } }>> {
    const results: Array<AgentImageWorkflowLaunchResult | { error: { code: string; message: string; toolCallKey: string } }> = [];
    for (let index = 0; index < input.call.arguments.images.length; index += 1) {
      const image = input.call.arguments.images[index]!;
      try {
        results.push(await this.launchOne(
          context,
          input,
          toolCallId,
          input.call.arguments.sharedStyle
            ? `${input.call.arguments.sharedStyle}\n${image.prompt}`
            : image.prompt,
          image.size,
          image.referenceRefs,
          index,
        ));
      } catch (error) {
        results.push({
          error: {
            ...normalizeToolError(error),
            toolCallKey: `${input.call.toolCallKey}:${index + 1}`,
          },
        });
      }
    }
    return results;
  }

  private async launchOne(
    context: AgentWorkflowLaunchContext,
    input: AgentToolRunInput,
    toolCallId: string,
    prompt: string,
    size?: "1K" | "2K" | "4K",
    referenceRefs?: string[],
    batchIndex?: number,
  ): Promise<AgentImageWorkflowLaunchResult> {
    return this.options.launcher.launchImageGeneration(context, {
      flowId: input.executionTarget.flowId,
      prompt,
      referenceAssetIds: referenceRefs ?? [],
      roundIndex: input.roundIndex,
      size,
      targetNodeId: input.executionTarget.targetNodeId,
      toolCallId,
      toolCallKey: batchIndex === undefined ? input.call.toolCallKey : `${input.call.toolCallKey}:${batchIndex + 1}`,
    });
  }
}

function normalizeToolError(error: unknown): { code: string; message: string } {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return {
      code: String((error as { code: unknown }).code),
      message: String((error as { message: unknown }).message),
    };
  }
  return {
    code: "AGENT_TOOL_FAILED",
    message: error instanceof Error ? error.message : String(error),
  };
}
