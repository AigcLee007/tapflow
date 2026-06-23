import { DatabaseTextGenerationRuntime } from "@aigc-flow/ai-gateway-core";
import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { Pool } from "pg";

import type { ApiEnv } from "../../config/env.js";
import { assertAgentOutputSafe } from "./agent-redaction.js";
import type { CanvasAgentSnapshotInput } from "./agent.schemas.js";
import type { AgentCostEstimator } from "./agent-cost-estimator.js";
import { buildAgentExecutorSystemPrompt } from "./agent-executor-prompt.js";
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
};

type TextRuntimeLike = Pick<DatabaseTextGenerationRuntime, "generateText">;

type AgentExecutorLimits = {
  maxEstimatedCredits: number;
  maxGeneratedItems: number;
  maxToolRounds: number;
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
      maxEstimatedCredits: options.limits?.maxEstimatedCredits ?? 50,
      maxGeneratedItems: options.limits?.maxGeneratedItems ?? 8,
      maxToolRounds: options.limits?.maxToolRounds ?? 8,
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
    const messages = [
      { content: buildAgentExecutorSystemPrompt(getAgentToolRegistryForModel()), role: "system" as const },
      { content: buildUserExecutorContext(input.prompt, input.snapshot), role: "user" as const },
    ];

    try {
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
          await input.onEvent?.({ toolCallKey: call.toolCallKey, toolName: call.toolName, type: "tool_started" });
          const costEstimate = await this.estimateCost(context, call);
          evaluateAgentToolPolicy({
            call,
            estimatedCredits: costEstimate?.totalCredits ?? 0,
            generatedItemCount: estimateGeneratedItemCount(call),
            limits: {
              allowBatchImage: true,
              allowImageEdit: false,
              allowVideo: false,
              maxEstimatedCredits: this.limits.maxEstimatedCredits,
              maxGeneratedItems: this.limits.maxGeneratedItems,
              maxToolRounds: this.limits.maxToolRounds,
              requireApproval: false,
            },
            successfulGenerationCount: toolResults.filter((result) => result.assetRefs.length > 0).length,
            toolRoundsUsed: round,
          });
          const result = await this.options.toolRunner.runToolCall(context, {
            call,
            costEstimate,
            executionTarget: resolveExecutionTarget(input.snapshot),
            roundIndex: round + 1,
            sessionId: input.sessionId,
            turnId: turn.turnId,
          });
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

  private async estimateCost(context: RuntimeContext, call: ParsedAgentToolCall) {
    if (call.toolName === "generate_image") {
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
