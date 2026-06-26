import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { Pool } from "pg";

import type { AgentGenerationCostEstimate } from "./agent-cost-estimator.js";
import type { AgentAssetReference } from "./agent-asset-references.js";
import type { AgentToolEvent } from "./agent-tool-events.js";
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
  continuationContext?: {
    action: "compare" | "continue-edit" | "make-poster" | "make-variant";
    assetId: string;
    assetIds?: string[];
    assetLabel: string;
    assetLabels?: string[];
    assetRefId: string;
    assetRefIds?: string[];
  } | null;
  costEstimate?: AgentGenerationCostEstimate | null;
  executionTarget: AgentToolExecutionTarget;
  roundIndex: number;
  sessionId: string;
  turnId: string;
  onEvent?: (event: AgentToolEvent) => void | Promise<void>;
};

export type AgentToolRunResult = {
  assetRefs: AgentAssetReference[];
  failures: Array<{
    code: string;
    message: string;
    toolCallKey: string;
  }>;
  status: "failed" | "partial_success" | "succeeded";
  tasks?: AgentToolTaskResult[];
  toolCallId: string;
  workflowRunIds: string[];
  workflowRuns?: Array<{
    nodeRunId?: string | null;
    workflowRunId: string;
  }>;
};

export type AgentToolTaskResult = {
  assetRefs: AgentAssetReference[];
  error?: {
    code: string;
    message: string;
  };
  nodeRunId?: string | null;
  status: "failed" | "succeeded";
  taskId: string;
  toolCallKey: string;
  workflowRunId?: string | null;
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

type AgentTaskCreateInput = {
  createdBy: string | null;
  inputJson: Record<string, unknown>;
  sessionId: string;
  status: string;
  taskKey: string;
  taskType: string;
  tenantId: string;
  title: string;
  turnId: string;
};

type AgentTaskUpdateInput = {
  errorJson?: Record<string, unknown> | null;
  outputJson?: Record<string, unknown>;
  status: string;
  tenantId: string;
};

type AgentToolRunnerRepository = {
  createTask(input: AgentTaskCreateInput): Promise<{ id: string }>;
  createToolCall(input: AgentToolCallCreateInput): Promise<{ id: string }>;
  updateTask(id: string, input: AgentTaskUpdateInput): Promise<void>;
  updateToolCall(id: string, input: AgentToolCallUpdateInput): Promise<void>;
};

type AgentWorkflowLauncherLike = Pick<AgentWorkflowLauncher, "launchImageGeneration">;

type AgentImageTaskLaunchResult = AgentImageWorkflowLaunchResult & {
  taskId: string;
  toolCallKey: string;
};

export class DatabaseAgentToolRunnerRepository implements AgentToolRunnerRepository {
  readonly pool: Pool;

  constructor(options?: { pool?: Pool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async createTask(input: AgentTaskCreateInput): Promise<{ id: string }> {
    return withTenantTransaction({ tenantId: input.tenantId, userId: input.createdBy }, async (client) => {
      const result = await client.query<{ id: string }>(
        `
          INSERT INTO agent_tasks (
            tenant_id,
            session_id,
            turn_id,
            task_key,
            task_type,
            title,
            status,
            input_json,
            created_by,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::jsonb, $9::uuid, now())
          RETURNING id::text AS id
        `,
        [
          input.tenantId,
          input.sessionId,
          input.turnId,
          input.taskKey,
          input.taskType,
          input.title,
          input.status,
          JSON.stringify(input.inputJson),
          input.createdBy,
        ],
      );
      return result.rows[0]!;
    }, this.pool);
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

  async updateTask(id: string, input: AgentTaskUpdateInput): Promise<void> {
    await withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      await client.query(
        `
          UPDATE agent_tasks
          SET
            status = $2,
            output_json = COALESCE($3::jsonb, output_json),
            error_json = $4::jsonb,
            started_at = CASE WHEN $2 = 'running' THEN COALESCE(started_at, now()) ELSE started_at END,
            finished_at = CASE WHEN $2 IN ('succeeded', 'failed', 'cancelled', 'skipped') THEN now() ELSE finished_at END,
            updated_at = now()
          WHERE id = $1::uuid
        `,
        [
          id,
          input.status,
          input.outputJson ? JSON.stringify(input.outputJson) : null,
          input.errorJson ? JSON.stringify(input.errorJson) : null,
        ],
      );
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
  private readonly batchConcurrency: number;

  constructor(private readonly options: {
    batchConcurrency?: number;
    launcher: AgentWorkflowLauncherLike;
    repository: AgentToolRunnerRepository;
  }) {
    this.batchConcurrency = Math.max(1, Math.floor(options.batchConcurrency ?? 2));
  }

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
      let launched: Array<AgentImageTaskLaunchResult | { error: { code: string; message: string; taskId?: string; toolCallKey: string } }> = [];
      if (input.call.toolName === "generate_image") {
        launched = [
          await this.launchOneWithFailureResult(
            context,
            input,
            input.call.arguments.prompt,
            input.call.arguments,
            input.call.arguments.referenceRefs,
          ),
        ];
      } else if (input.call.toolName === "edit_image") {
        launched = [
          await this.launchOneWithFailureResult(
            context,
            input,
            input.call.arguments.prompt,
            input.call.arguments,
            input.call.arguments.referenceRefs,
          ),
        ];
      } else if (input.call.toolName === "generate_image_batch") {
        launched = await this.launchBatch(context, input as AgentToolRunInput & {
          call: Extract<ParsedAgentToolCall, { toolName: "generate_image_batch" }>;
        }, record.id);
      }

      const successes = launched.filter((result): result is AgentImageTaskLaunchResult => !("error" in result));
      const failures = launched.flatMap((result) => "error" in result ? [result.error] : []);
      const assetRefs = successes.flatMap((result) => result.assetRefs);
      const status = failures.length === 0 ? "succeeded" : successes.length > 0 ? "partial_success" : "failed";
      const taskResults = launched.map((result) => resultToTaskResult(result));
      const resultJson = {
        assetRefs,
        failures,
        status,
        tasks: taskResults,
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
        tasks: taskResults,
        toolCallId: taskResults[0]?.taskId ?? record.id,
        workflowRuns: successes.map((result) => ({
          nodeRunId: result.nodeRunId ?? null,
          workflowRunId: result.workflowRunId,
        })),
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
        tasks: [],
        workflowRuns: [],
        workflowRunIds: [],
      };
    }
  }

  private async launchBatch(
    context: AgentWorkflowLaunchContext,
    input: AgentToolRunInput & { call: Extract<ParsedAgentToolCall, { toolName: "generate_image_batch" }> },
    toolCallId: string,
  ): Promise<Array<AgentImageTaskLaunchResult | { error: { code: string; message: string; taskId?: string; toolCallKey: string } }>> {
    const plannedTasks = await Promise.all(
      input.call.arguments.images.map((image, index) => {
        const toolCallKey = `${input.call.toolCallKey}:${index + 1}`;
        const prompt = input.call.arguments.sharedStyle
          ? `${input.call.arguments.sharedStyle}\n${image.prompt}`
          : image.prompt;
        return this.createImageTask(context, input, {
          batchIndex: index,
          prompt,
          settings: image,
          taskKey: toolCallKey,
          taskType: "generate_image_batch_child",
          title: `Batch image ${index + 1}`,
          toolName: "generate_image_batch",
        });
      }),
    );
    return mapWithConcurrency(input.call.arguments.images, this.batchConcurrency, async (image, index) => {
      const task = plannedTasks[index]!;
      try {
        return await this.launchOne(
          context,
          input,
          task.id,
          input.call.arguments.sharedStyle
            ? `${input.call.arguments.sharedStyle}\n${image.prompt}`
            : image.prompt,
          image,
          image.referenceRefs,
          index,
          task.id,
        );
      } catch (error) {
        const normalized = normalizeToolError(error);
        await this.options.repository.updateTask(task.id, {
          errorJson: normalized,
          status: "failed",
          tenantId: context.tenantId,
        });
        await input.onEvent?.({
          ...normalized,
          taskId: task.id,
          toolCallKey: `${input.call.toolCallKey}:${index + 1}`,
          type: "task_failed",
        });
        return {
          error: {
            ...normalized,
            taskId: task.id,
            toolCallKey: `${input.call.toolCallKey}:${index + 1}`,
          },
        };
      }
    });
  }

  private async launchOne(
    context: AgentWorkflowLaunchContext,
    input: AgentToolRunInput,
    toolCallId: string,
    prompt: string,
    settings?: {
      aspectRatio?: string;
      format?: "jpeg" | "png" | "webp";
      modelDisplayName?: string;
      moderation?: "auto" | "low";
      n?: number;
      quality?: string;
      routeKey?: string;
      routeLabel?: string;
      size?: "1K" | "2K" | "4K";
    },
    referenceRefs?: string[],
    batchIndex?: number,
    precreatedTaskId?: string,
  ): Promise<AgentImageTaskLaunchResult> {
    const task = precreatedTaskId
      ? { id: precreatedTaskId, toolCallKey: batchIndex === undefined ? input.call.toolCallKey : `${input.call.toolCallKey}:${batchIndex + 1}` }
      : await this.createImageTask(context, input, {
          batchIndex,
          prompt,
          settings,
          taskKey: batchIndex === undefined ? input.call.toolCallKey : `${input.call.toolCallKey}:${batchIndex + 1}`,
          taskType: input.call.toolName,
          title: getTaskTitle(input.call.toolName, batchIndex),
          toolName: input.call.toolName,
        });
    await this.options.repository.updateTask(task.id, { status: "running", tenantId: context.tenantId });
    const continuationReferenceAssetIds = Array.from(
      new Set(
        input.continuationContext?.assetIds?.filter((value): value is string => typeof value === "string" && value.length > 0)
          ?? (input.continuationContext?.assetId ? [input.continuationContext.assetId] : []),
      ),
    );
    const resolvedReferenceAssetIds =
      referenceRefs && referenceRefs.length > 0
        ? referenceRefs
        : continuationReferenceAssetIds;
    const result = await this.options.launcher.launchImageGeneration(context, {
      aspectRatio: settings?.aspectRatio,
      flowId: input.executionTarget.flowId,
      format: settings?.format,
      modelDisplayName: settings?.modelDisplayName,
      moderation: settings?.moderation,
      n: settings?.n,
      prompt,
      quality: settings?.quality,
      referenceAssetIds: resolvedReferenceAssetIds,
      roundIndex: input.roundIndex,
      routeKey: settings?.routeKey,
      routeLabel: settings?.routeLabel,
      size: settings?.size,
      targetNodeId: input.executionTarget.targetNodeId,
      toolCallId: task.id,
      toolCallKey: batchIndex === undefined ? input.call.toolCallKey : `${input.call.toolCallKey}:${batchIndex + 1}`,
    });
    const outputJson = {
      assetRefs: result.assetRefs,
      nodeRunId: result.nodeRunId,
      status: result.status,
      workflowRunId: result.workflowRunId,
    };
    await this.options.repository.updateTask(task.id, {
      outputJson,
      status: result.status,
      tenantId: context.tenantId,
    });
    await input.onEvent?.({
      nodeRunId: result.nodeRunId ?? undefined,
      toolCallKey: task.toolCallKey,
      type: "workflow_run_linked",
      workflowRunId: result.workflowRunId,
    });
    for (const assetRef of result.assetRefs) {
      await input.onEvent?.({
        assetRef,
        taskId: task.id,
        toolCallKey: task.toolCallKey,
        type: "artifact_created",
      });
    }
    await input.onEvent?.({
      result: outputJson,
      taskId: task.id,
      toolCallKey: task.toolCallKey,
      type: "task_completed",
    });
    return {
      ...result,
      taskId: task.id,
      toolCallKey: task.toolCallKey,
    };
  }

  private async launchOneWithFailureResult(
    context: AgentWorkflowLaunchContext,
    input: AgentToolRunInput,
    prompt: string,
    settings?: {
      aspectRatio?: string;
      format?: "jpeg" | "png" | "webp";
      modelDisplayName?: string;
      moderation?: "auto" | "low";
      n?: number;
      quality?: string;
      routeKey?: string;
      routeLabel?: string;
      size?: "1K" | "2K" | "4K";
    },
    referenceRefs?: string[],
  ): Promise<AgentImageTaskLaunchResult | { error: { code: string; message: string; taskId: string; toolCallKey: string } }> {
    const task = await this.createImageTask(context, input, {
      prompt,
      settings,
      taskKey: input.call.toolCallKey,
      taskType: input.call.toolName,
      title: getTaskTitle(input.call.toolName),
      toolName: input.call.toolName,
    });
    try {
      return await this.launchOne(
        context,
        input,
        task.id,
        prompt,
        settings,
        referenceRefs,
        undefined,
        task.id,
      );
    } catch (error) {
      const normalized = normalizeToolError(error);
      await this.options.repository.updateTask(task.id, {
        errorJson: normalized,
        status: "failed",
        tenantId: context.tenantId,
      });
      await input.onEvent?.({
        ...normalized,
        taskId: task.id,
        toolCallKey: input.call.toolCallKey,
        type: "task_failed",
      });
      return {
        error: {
          ...normalized,
          taskId: task.id,
          toolCallKey: input.call.toolCallKey,
        },
      };
    }
  }

  private async createImageTask(
    context: AgentWorkflowLaunchContext,
    input: AgentToolRunInput,
    task: {
      batchIndex?: number;
      prompt: string;
      settings?: {
        aspectRatio?: string;
        format?: "jpeg" | "png" | "webp";
        modelDisplayName?: string;
        moderation?: "auto" | "low";
        n?: number;
        quality?: string;
        routeKey?: string;
        routeLabel?: string;
        size?: "1K" | "2K" | "4K";
      };
      taskKey: string;
      taskType: string;
      title: string;
      toolName: ParsedAgentToolCall["toolName"];
    },
  ) {
    const created = await this.options.repository.createTask({
      createdBy: context.userId,
      inputJson: buildTaskInputJson(input, task.prompt, task.settings, task.batchIndex),
      sessionId: input.sessionId,
      status: "queued",
      taskKey: task.taskKey,
      taskType: task.taskType,
      tenantId: context.tenantId,
      title: task.title,
      turnId: input.turnId,
    });
    await input.onEvent?.({
      taskId: created.id,
      title: task.title,
      toolCallKey: task.taskKey,
      toolName: task.toolName,
      type: "task_created",
    });
    return {
      id: created.id,
      toolCallKey: task.taskKey,
    };
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

function buildTaskInputJson(
  input: AgentToolRunInput,
  prompt: string,
  settings?: {
    aspectRatio?: string;
    format?: "jpeg" | "png" | "webp";
    modelDisplayName?: string;
    moderation?: "auto" | "low";
    n?: number;
    quality?: string;
    routeKey?: string;
    routeLabel?: string;
    size?: "1K" | "2K" | "4K";
  },
  batchIndex?: number,
): Record<string, unknown> {
  return compactRecord({
    batchIndex,
    costEstimate: input.costEstimate ?? undefined,
    executionTarget: input.executionTarget,
    prompt,
    referenceRefs: settings && "referenceRefs" in settings && Array.isArray(settings.referenceRefs)
      ? settings.referenceRefs
      : undefined,
    roundIndex: input.roundIndex,
    settings: compactRecord({
      aspectRatio: settings?.aspectRatio,
      format: settings?.format,
      modelDisplayName: settings?.modelDisplayName,
      moderation: settings?.moderation,
      n: settings?.n,
      quality: settings?.quality,
      routeKey: settings?.routeKey,
      routeLabel: settings?.routeLabel,
      size: settings?.size,
    }),
    toolCallKey: batchIndex === undefined ? input.call.toolCallKey : `${input.call.toolCallKey}:${batchIndex + 1}`,
    toolName: input.call.toolName,
  });
}

function getTaskTitle(toolName: ParsedAgentToolCall["toolName"], batchIndex?: number) {
  if (batchIndex !== undefined) return `Batch image ${batchIndex + 1}`;
  if (toolName === "generate_image_batch") return "Batch image generation";
  if (toolName === "edit_image") return "Image edit";
  return "Image generation";
}

function resultToTaskResult(
  result: AgentImageTaskLaunchResult | { error: { code: string; message: string; taskId?: string; toolCallKey: string } },
): AgentToolTaskResult {
  if ("error" in result) {
    return {
      assetRefs: [],
      error: {
        code: result.error.code,
        message: result.error.message,
      },
      status: "failed",
      taskId: typeof result.error.taskId === "string" ? result.error.taskId : "",
      toolCallKey: result.error.toolCallKey,
    };
  }
  return {
    assetRefs: result.assetRefs,
    nodeRunId: result.nodeRunId,
    status: result.status,
    taskId: "taskId" in result && typeof result.taskId === "string" ? result.taskId : "",
    toolCallKey: "toolCallKey" in result && typeof result.toolCallKey === "string" ? result.toolCallKey : "",
    workflowRunId: result.workflowRunId,
  };
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""),
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}
