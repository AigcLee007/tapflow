import { DatabaseTextGenerationRuntime } from "@aigc-flow/ai-gateway-core";
import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { Pool } from "pg";

import type { ApiEnv } from "../../config/env.js";
import { assertAgentOutputSafe } from "./agent-redaction.js";
import type { CanvasAgentSnapshotInput } from "./agent.schemas.js";
import type { AgentCostEstimator } from "./agent-cost-estimator.js";
import { buildAgentExecutorSystemPrompt, buildAgentExecutorToolRepairPrompt } from "./agent-executor-prompt.js";
import { isProductionImageAgentPrompt } from "./agent-production-intent.js";
import { buildAgentToolContinuationMessage } from "./agent-tool-context.js";
import type { AgentToolEvent } from "./agent-tool-events.js";
import { evaluateAgentToolPolicy } from "./agent-tool-policy.js";
import { getAgentToolRegistryForModel } from "./agent-tool-registry.js";
import { parseAgentToolCall, type ParsedAgentToolCall } from "./agent-tool-schemas.js";
import type { AgentToolRunner, AgentToolRunResult } from "./agent-tool-runner.js";

type RuntimeContext = {
  tenantId: string;
  userId: string | null;
};

type ExecutorRepository = {
  createAssistantMessage(input: {
    content: string;
    metadata?: Record<string, unknown>;
    sessionId: string;
    tenantId: string;
  }): Promise<{ messageId: string }>;
  createTurn(input: {
    sessionId: string;
    snapshot: CanvasAgentSnapshotInput;
    tenantId: string;
    userMessageId: string;
  }): Promise<{ turnId: string }>;
  createUserMessage(input: {
    content: string;
    sessionId: string;
    tenantId: string;
  }): Promise<{ messageId: string }>;
  markTurnFailed(input: {
    error: Record<string, unknown>;
    tenantId: string;
    turnId: string;
  }): Promise<void>;
  markTurnSucceeded(input: {
    planJson: Record<string, unknown>;
    tenantId: string;
    turnId: string;
  }): Promise<void>;
  readPendingApproval(input: {
    sessionId: string;
    tenantId: string;
    toolCallKey: string;
    turnId: string;
  }): Promise<{
    costEstimate: Record<string, unknown> | null;
    pendingToolCall: unknown;
    snapshot: CanvasAgentSnapshotInput;
  } | null>;
};

type TextRuntimeLike = Pick<DatabaseTextGenerationRuntime, "generateText">;

type AgentExecutorLimits = {
  allowBatchImage: boolean;
  allowImageEdit: boolean;
  allowVideo: boolean;
  maxEstimatedCredits: number;
  maxGeneratedItems: number;
  maxToolRounds: number;
  requireApproval: boolean;
};

export type AgentExecutorTurnInput = {
  onEvent?: (event: AgentToolEvent) => void | Promise<void>;
  prompt: string;
  sessionId: string;
  snapshot: CanvasAgentSnapshotInput;
};

export type AgentExecutorTurnResult = {
  finalText: string;
  sessionId: string;
  toolResults: AgentToolRunResult[];
  turnId: string;
};

export type AgentExecutorApproveInput = {
  onEvent?: (event: AgentToolEvent) => void | Promise<void>;
  sessionId: string;
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
  toolCallKey: string;
  turnId: string;
};

export class AgentExecutorError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AgentExecutorError";
    this.statusCode = statusCode;
  }
}

export class DatabaseAgentExecutorRepository implements ExecutorRepository {
  readonly pool: Pool;

  constructor(options?: { pool?: Pool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async createUserMessage(input: { content: string; sessionId: string; tenantId: string }): Promise<{ messageId: string }> {
    return this.insertMessage(input.tenantId, input.sessionId, "user", input.content);
  }

  async createAssistantMessage(input: {
    content: string;
    metadata?: Record<string, unknown>;
    sessionId: string;
    tenantId: string;
  }): Promise<{ messageId: string }> {
    return this.insertMessage(input.tenantId, input.sessionId, "assistant", input.content, input.metadata);
  }

  async createTurn(input: {
    sessionId: string;
    snapshot: CanvasAgentSnapshotInput;
    tenantId: string;
    userMessageId: string;
  }): Promise<{ turnId: string }> {
    return withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      const result = await client.query<{ id: string }>(
        `
          INSERT INTO agent_turns (
            tenant_id,
            session_id,
            user_message_id,
            status,
            snapshot_json,
            plan_json,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, 'pending', $4::jsonb, '{}'::jsonb, now())
          RETURNING id::text AS id
        `,
        [input.tenantId, input.sessionId, input.userMessageId, JSON.stringify(input.snapshot)],
      );
      return { turnId: result.rows[0]!.id };
    }, this.pool);
  }

  async markTurnFailed(input: { error: Record<string, unknown>; tenantId: string; turnId: string }): Promise<void> {
    await withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      await client.query(
        `UPDATE agent_turns SET status = 'failed', error_json = $2::jsonb, updated_at = now() WHERE id = $1::uuid`,
        [input.turnId, JSON.stringify(input.error)],
      );
    }, this.pool);
  }

  async markTurnSucceeded(input: { planJson: Record<string, unknown>; tenantId: string; turnId: string }): Promise<void> {
    await withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      await client.query(
        `UPDATE agent_turns SET status = 'planned', plan_json = $2::jsonb, updated_at = now() WHERE id = $1::uuid`,
        [input.turnId, JSON.stringify(input.planJson)],
      );
    }, this.pool);
  }

  async readPendingApproval(input: {
    sessionId: string;
    tenantId: string;
    toolCallKey: string;
    turnId: string;
  }): Promise<{
    costEstimate: Record<string, unknown> | null;
    pendingToolCall: unknown;
    snapshot: CanvasAgentSnapshotInput;
  } | null> {
    return withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      const result = await client.query<{
        plan_json: Record<string, unknown>;
        snapshot_json: CanvasAgentSnapshotInput;
      }>(
        `
          SELECT plan_json, snapshot_json
          FROM agent_turns
          WHERE tenant_id = $1::uuid
            AND session_id = $2::uuid
            AND id = $3::uuid
            AND status = 'planned'
          LIMIT 1
        `,
        [input.tenantId, input.sessionId, input.turnId],
      );
      if (result.rowCount === 0) return null;
      const row = result.rows[0]!;
      const pendingToolCall = row.plan_json?.pendingToolCall;
      const pendingKey = pendingToolCall && typeof pendingToolCall === "object"
        ? (pendingToolCall as Record<string, unknown>).toolCallKey
        : null;
      if (pendingKey !== input.toolCallKey) return null;
      return {
        costEstimate: row.plan_json?.costEstimate && typeof row.plan_json.costEstimate === "object"
          ? row.plan_json.costEstimate as Record<string, unknown>
          : null,
        pendingToolCall,
        snapshot: row.snapshot_json,
      };
    }, this.pool);
  }

  private async insertMessage(
    tenantId: string,
    sessionId: string,
    role: "assistant" | "user",
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ messageId: string }> {
    return withTenantTransaction({ tenantId, userId: null }, async (client) => {
      const result = await client.query<{ id: string }>(
        `
          INSERT INTO agent_messages (tenant_id, session_id, role, content, metadata_json)
          VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb)
          RETURNING id::text AS id
        `,
        [tenantId, sessionId, role, content, JSON.stringify(metadata ?? {})],
      );
      return { messageId: result.rows[0]!.id };
    }, this.pool);
  }
}

export class AgentExecutorService {
  private readonly limits: AgentExecutorLimits;
  private readonly routeKey: string;

  constructor(private readonly options: {
    costEstimator: Pick<AgentCostEstimator, "estimateGenerateImage" | "estimateGenerateImageBatch">;
    env?: ApiEnv;
    limits?: Partial<AgentExecutorLimits>;
    repository: ExecutorRepository;
    textRuntime: TextRuntimeLike;
    toolRunner: Pick<AgentToolRunner, "runToolCall">;
  }) {
    this.limits = {
      allowBatchImage: options.limits?.allowBatchImage ?? true,
      allowImageEdit: options.limits?.allowImageEdit ?? false,
      allowVideo: options.limits?.allowVideo ?? false,
      maxEstimatedCredits: options.limits?.maxEstimatedCredits ?? 50,
      maxGeneratedItems: options.limits?.maxGeneratedItems ?? 8,
      maxToolRounds: options.limits?.maxToolRounds ?? 8,
      requireApproval: options.limits?.requireApproval ?? false,
    };
    this.routeKey = options.env?.agentTextRouteKey ?? "text.default";
  }

  async executeTurn(context: RuntimeContext, input: AgentExecutorTurnInput): Promise<AgentExecutorTurnResult> {
    const userMessage = await this.options.repository.createUserMessage({
      content: input.prompt,
      sessionId: input.sessionId,
      tenantId: context.tenantId,
    });
    const turn = await this.options.repository.createTurn({
      sessionId: input.sessionId,
      snapshot: input.snapshot,
      tenantId: context.tenantId,
      userMessageId: userMessage.messageId,
    });
    const toolResults: AgentToolRunResult[] = [];
    const requiresProductionTool = isProductionImageAgentPrompt(input.prompt);
    let repairedMissingToolCall = false;
    const messages = [
      { content: buildAgentExecutorSystemPrompt(getAgentToolRegistryForModel()), role: "system" as const },
      { content: buildUserExecutorContext(input.prompt, input.snapshot), role: "user" as const },
    ];

    try {
      await input.onEvent?.({
        detail: "Reading the canvas context and preparing the next production step.",
        label: "Understanding request",
        type: "thinking_status",
      });
      for (let round = 0; round <= this.limits.maxToolRounds; round += 1) {
        const runtimeResult = await this.options.textRuntime.generateText(context, {
          maxTokens: 2500,
          messages,
          routeKey: this.routeKey,
          temperature: 0.2,
        });
        const parsed = parseExecutorModelOutput(runtimeResult.outputText);
        if (parsed.reply) {
          await input.onEvent?.({ content: parsed.reply, type: "message_delta" });
        }
        if (parsed.toolCalls.length === 0) {
          const finalText = parsed.reply || runtimeResult.outputText.trim();
          if (requiresProductionTool && toolResults.length === 0) {
            if (!repairedMissingToolCall) {
              repairedMissingToolCall = true;
              messages.push({
                content: buildAgentExecutorToolRepairPrompt({
                  assistantText: finalText,
                  userPrompt: input.prompt,
                }),
                role: "user" as const,
              });
              continue;
            }
            throw new AgentExecutorError(
              422,
              "AGENT_EXECUTOR_REQUIRES_TOOL_CALL",
              "Agent text model returned guidance instead of executable image generation tool calls.",
            );
          }
          assertAgentOutputSafe({ finalText, toolResults });
          await this.options.repository.createAssistantMessage({
            content: finalText,
            metadata: { executor: true },
            sessionId: input.sessionId,
            tenantId: context.tenantId,
          });
          await this.options.repository.markTurnSucceeded({
            planJson: { executor: true, finalText, toolResults },
            tenantId: context.tenantId,
            turnId: turn.turnId,
          });
          await input.onEvent?.({ finalText, turnId: turn.turnId, type: "turn_completed" });
          return {
            finalText,
            sessionId: input.sessionId,
            toolResults,
            turnId: turn.turnId,
          };
        }

        if (round >= this.limits.maxToolRounds) {
          throw new AgentExecutorError(400, "AGENT_EXECUTOR_MAX_ROUNDS", "Agent executor reached the maximum tool rounds.");
        }

        for (const call of parsed.toolCalls) {
          await input.onEvent?.({
            detail: "A production tool has been prepared and is about to start.",
            label: "Creating task card",
            type: "thinking_status",
          });
          await input.onEvent?.({ toolCallKey: call.toolCallKey, toolName: call.toolName, type: "tool_started" });
          const costEstimate = await this.estimateCost(context, call);
          const policy = evaluateAgentToolPolicy({
            call,
            estimatedCredits: costEstimate?.totalCredits ?? 0,
            generatedItemCount: estimateGeneratedItemCount(call),
            limits: {
              allowBatchImage: this.limits.allowBatchImage,
              allowImageEdit: this.limits.allowImageEdit,
              allowVideo: this.limits.allowVideo,
              maxEstimatedCredits: this.limits.maxEstimatedCredits,
              maxGeneratedItems: this.limits.maxGeneratedItems,
              maxToolRounds: this.limits.maxToolRounds,
              requireApproval: this.limits.requireApproval,
            },
            successfulGenerationCount: toolResults.filter((result) => result.assetRefs.length > 0).length,
            toolRoundsUsed: round,
          });
          if (policy.requiresApproval) {
            await input.onEvent?.({
              estimate: {
                ...(costEstimate && typeof costEstimate === "object" ? costEstimate : {}),
                referenceRefs: getApprovalReferenceRefs(call),
              },
              toolCallKey: call.toolCallKey,
              turnId: turn.turnId,
              type: "approval_required",
            });
            const finalText = "Confirm the estimated credits to continue this Agent production step.";
            await this.options.repository.createAssistantMessage({
              content: finalText,
              metadata: { approvalRequired: true, executor: true },
              sessionId: input.sessionId,
              tenantId: context.tenantId,
            });
            await this.options.repository.markTurnSucceeded({
              planJson: {
                approvalRequired: true,
                executor: true,
                pendingToolCall: call,
                costEstimate,
              },
              tenantId: context.tenantId,
              turnId: turn.turnId,
            });
            await input.onEvent?.({ finalText, turnId: turn.turnId, type: "turn_completed" });
            return {
              finalText,
              sessionId: input.sessionId,
              toolResults,
              turnId: turn.turnId,
            };
          }
          const result = await this.options.toolRunner.runToolCall(context, {
            call,
            costEstimate,
            executionTarget: resolveExecutionTarget(input.snapshot),
            roundIndex: round + 1,
            sessionId: input.sessionId,
            turnId: turn.turnId,
          });
          await input.onEvent?.({
            taskId: result.toolCallId,
            title: getTaskTitle(call.toolName),
            toolCallKey: call.toolCallKey,
            toolName: call.toolName,
            type: "task_created",
          });
          for (const workflowRun of result.workflowRuns ?? []) {
            await input.onEvent?.({
              nodeRunId: workflowRun.nodeRunId ?? undefined,
              toolCallKey: call.toolCallKey,
              type: "workflow_run_linked",
              workflowRunId: workflowRun.workflowRunId,
            });
          }
          for (const assetRef of result.assetRefs) {
            await input.onEvent?.({
              assetRef,
              taskId: result.toolCallId,
              toolCallKey: call.toolCallKey,
              type: "artifact_created",
            });
          }
          toolResults.push(result);
          await input.onEvent?.({ result, toolCallKey: call.toolCallKey, type: "tool_result" });
          messages.push({ content: buildAgentToolContinuationMessage(result), role: "user" as const });
        }
      }
    } catch (error) {
      const normalized = normalizeExecutorError(error);
      await this.options.repository.markTurnFailed({
        error: normalized,
        tenantId: context.tenantId,
        turnId: turn.turnId,
      });
      await input.onEvent?.({ ...normalized, turnId: turn.turnId, type: "turn_failed" });
      throw error;
    }

    throw new AgentExecutorError(400, "AGENT_EXECUTOR_MAX_ROUNDS", "Agent executor reached the maximum tool rounds.");
  }

  async approveToolCall(context: RuntimeContext, input: AgentExecutorApproveInput): Promise<AgentExecutorTurnResult> {
    const pending = await this.options.repository.readPendingApproval({
      sessionId: input.sessionId,
      tenantId: context.tenantId,
      toolCallKey: input.toolCallKey,
      turnId: input.turnId,
    });
    if (!pending) {
      throw new AgentExecutorError(404, "AGENT_TOOL_APPROVAL_NOT_FOUND", "Agent tool approval was not found or is no longer pending.");
    }

    const call = applyApprovedSettings(parseAgentToolCall(pending.pendingToolCall), input.settings);
    const costEstimate = await this.estimateCost(context, call);
    evaluateAgentToolPolicy({
      call,
      estimatedCredits: costEstimate?.totalCredits ?? 0,
      generatedItemCount: estimateGeneratedItemCount(call),
      limits: {
        allowBatchImage: this.limits.allowBatchImage,
        allowImageEdit: this.limits.allowImageEdit,
        allowVideo: this.limits.allowVideo,
        maxEstimatedCredits: this.limits.maxEstimatedCredits,
        maxGeneratedItems: this.limits.maxGeneratedItems,
        maxToolRounds: this.limits.maxToolRounds,
        requireApproval: false,
      },
      successfulGenerationCount: 0,
      toolRoundsUsed: 0,
    });

    await input.onEvent?.({ toolCallKey: call.toolCallKey, toolName: call.toolName, type: "tool_started" });
    const result = await this.options.toolRunner.runToolCall(context, {
      call,
      costEstimate,
      executionTarget: resolveExecutionTarget(pending.snapshot),
      roundIndex: 1,
      sessionId: input.sessionId,
      turnId: input.turnId,
    });
    await input.onEvent?.({
      taskId: result.toolCallId,
      title: getTaskTitle(call.toolName),
      toolCallKey: call.toolCallKey,
      toolName: call.toolName,
      type: "task_created",
    });
    for (const assetRef of result.assetRefs) {
      await input.onEvent?.({
        assetRef,
        taskId: result.toolCallId,
        toolCallKey: call.toolCallKey,
        type: "artifact_created",
      });
    }
    await input.onEvent?.({ result, toolCallKey: call.toolCallKey, type: "tool_result" });

    const finalText = result.assetRefs.length > 0
      ? "Agent production step submitted successfully. You can place the generated result on the canvas when it is ready."
      : "Agent production step finished, but no generated asset was returned.";
    assertAgentOutputSafe({ finalText, toolResults: [result] });
    await this.options.repository.createAssistantMessage({
      content: finalText,
      metadata: { approvedToolCallKey: call.toolCallKey, executor: true },
      sessionId: input.sessionId,
      tenantId: context.tenantId,
    });
    await this.options.repository.markTurnSucceeded({
      planJson: {
        approvedToolCallKey: call.toolCallKey,
        executor: true,
        finalText,
        toolResults: [result],
      },
      tenantId: context.tenantId,
      turnId: input.turnId,
    });
    await input.onEvent?.({ finalText, turnId: input.turnId, type: "turn_completed" });
    return {
      finalText,
      sessionId: input.sessionId,
      toolResults: [result],
      turnId: input.turnId,
    };
  }

  private async estimateCost(context: RuntimeContext, call: ParsedAgentToolCall) {
    if (call.toolName === "generate_image") {
      return this.options.costEstimator.estimateGenerateImage({
        ...call.arguments,
        tenantId: context.tenantId,
      });
    }
    if (call.toolName === "edit_image") {
      return this.options.costEstimator.estimateGenerateImage({
        ...call.arguments,
        tenantId: context.tenantId,
      });
    }
    if (call.toolName === "generate_image_batch") {
      return this.options.costEstimator.estimateGenerateImageBatch({
        ...call.arguments,
        tenantId: context.tenantId,
      });
    }
    return null;
  }
}

function getApprovalReferenceRefs(call: ParsedAgentToolCall): string[] {
  if (call.toolName === "generate_image_batch") {
    return call.arguments.images.flatMap((image) => image.referenceRefs ?? []);
  }
  if (call.toolName === "generate_image" || call.toolName === "edit_image") {
    return call.arguments.referenceRefs ?? [];
  }
  return [];
}

function getTaskTitle(toolName: ParsedAgentToolCall["toolName"]) {
  if (toolName === "generate_image_batch") return "Batch image generation";
  if (toolName === "edit_image") return "Image edit";
  return "Image generation";
}

function parseExecutorModelOutput(rawText: string): {
  reply: string;
  toolCalls: ParsedAgentToolCall[];
} {
  const trimmed = rawText.trim();
  const parsedJson = tryParseJsonObject(trimmed);
  if (!parsedJson) {
    assertAgentOutputSafe(trimmed);
    return { reply: trimmed, toolCalls: [] };
  }
  assertAgentOutputSafe(parsedJson);
  const record = parsedJson as Record<string, unknown>;
  const rawCalls = Array.isArray(record.toolCalls) ? record.toolCalls : [];
  return {
    reply: typeof record.reply === "string" ? record.reply : "",
    toolCalls: rawCalls.map((call) => parseAgentToolCall(call)),
  };
}

function tryParseJsonObject(rawText: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
    if (!fenced) return null;
    return tryParseJsonObject(fenced);
  }
}

function buildUserExecutorContext(prompt: string, snapshot: CanvasAgentSnapshotInput): string {
  return JSON.stringify({
    canvas: {
      flowId: snapshot.flowId,
      nodeCount: snapshot.nodes.length,
      selectedNodeIds: snapshot.selectedNodeIds,
      targetNodeId: resolveExecutionTarget(snapshot).targetNodeId,
    },
    prompt,
  });
}

function resolveExecutionTarget(snapshot: CanvasAgentSnapshotInput) {
  const selectedImage = snapshot.nodes.find((node) => node.selected && node.kind === "image");
  const firstImage = snapshot.nodes.find((node) => node.kind === "image");
  return {
    flowId: snapshot.flowId,
    targetNodeId: selectedImage?.id ?? firstImage?.id ?? null,
  };
}

function estimateGeneratedItemCount(call: ParsedAgentToolCall): number {
  if (call.toolName === "generate_image_batch") return call.arguments.images.length;
  if (call.toolName === "generate_image") return 1;
  return 0;
}

function applyApprovedSettings(
  call: ParsedAgentToolCall,
  settings?: AgentExecutorApproveInput["settings"],
): ParsedAgentToolCall {
  if (!settings) return call;
  if (call.toolName === "generate_image_batch") {
    return {
      ...call,
      arguments: {
        ...call.arguments,
        images: call.arguments.images.map((image) => ({
          ...image,
          aspectRatio: settings.aspectRatio ?? image.aspectRatio,
          format: settings.format ?? image.format,
          modelDisplayName: settings.modelDisplayName ?? image.modelDisplayName,
          moderation: settings.moderation ?? image.moderation,
          n: settings.n ?? image.n,
          quality: settings.quality ?? image.quality,
          routeKey: settings.routeKey ?? image.routeKey,
          routeLabel: settings.routeLabel ?? image.routeLabel,
          size: settings.size ?? image.size,
        })),
      },
    };
  }
  if (call.toolName === "edit_image") {
    return {
      ...call,
      arguments: {
        ...call.arguments,
        aspectRatio: settings.aspectRatio ?? call.arguments.aspectRatio,
        format: settings.format ?? call.arguments.format,
        modelDisplayName: settings.modelDisplayName ?? call.arguments.modelDisplayName,
        moderation: settings.moderation ?? call.arguments.moderation,
        n: settings.n ?? call.arguments.n,
        quality: settings.quality ?? call.arguments.quality,
        routeKey: settings.routeKey ?? call.arguments.routeKey,
        routeLabel: settings.routeLabel ?? call.arguments.routeLabel,
        size: settings.size ?? call.arguments.size,
      },
    };
  }
  if (call.toolName !== "generate_image") return call;

  return {
    ...call,
    arguments: {
      ...call.arguments,
      aspectRatio: settings.aspectRatio ?? call.arguments.aspectRatio,
      format: settings.format ?? (call.arguments as { format?: "jpeg" | "png" | "webp" }).format,
      modelDisplayName: settings.modelDisplayName ?? call.arguments.modelDisplayName,
      moderation: settings.moderation ?? (call.arguments as { moderation?: "auto" | "low" }).moderation,
      n: settings.n ?? call.arguments.n,
      quality: settings.quality ?? call.arguments.quality,
      routeKey: settings.routeKey ?? call.arguments.routeKey,
      routeLabel: settings.routeLabel ?? call.arguments.routeLabel,
      size: settings.size ?? call.arguments.size,
    },
  };
}

function normalizeExecutorError(error: unknown): { code: string; message: string } {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return {
      code: String((error as { code: unknown }).code),
      message: String((error as { message: unknown }).message),
    };
  }
  return {
    code: "AGENT_EXECUTOR_FAILED",
    message: error instanceof Error ? error.message : String(error),
  };
}
