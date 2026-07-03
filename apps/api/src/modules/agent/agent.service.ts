import { DatabaseTextGenerationRuntime } from "@aigc-flow/ai-gateway-core";
import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import type { ApiEnv } from "../../config/env.js";
import { AgentPlannerRuntimeError, AgentPlannerService } from "./agent-planner.service.js";
import { AgentExecutorError, type AgentExecutorService } from "./agent-executor.service.js";
import { AgentReferenceResolutionError } from "./agent-reference-context.js";
import { AgentCanvasService } from "./agent-canvas.service.js";
import { isProductionImageAgentPrompt } from "./agent-production-intent.js";
import { AgentEventService, toAgentRepositoryError } from "./agent-event.service.js";
import type { AgentRunSettingsService } from "./agent-run-settings.service.js";
import { AgentSessionRepository } from "./agent-session.repository.js";
import { formatAgentToolEvent } from "./agent-tool-events.js";
import type { AiModelCatalogService } from "../ai-model-catalog/ai-model-catalog.service.js";
import type { FlowsService } from "../flows/flows.service.js";
import type {
  ApproveAgentToolCallInput,
  CanvasAgentSnapshotInput,
  CreateAgentSessionInput,
  CreateAgentTurnInput,
} from "./agent.schemas.js";

type PgPool = Pool;

type AgentContext = {
  tenantId: string;
  userId: string | null;
};

type AgentSessionRow = {
  created_at: string;
  flow_id: string | null;
  id: string;
  project_id: string | null;
  status: string;
  title: string;
  updated_at: string;
};

type AgentTurnRow = {
  assistant_message_id: string | null;
  created_at: string;
  error_json: unknown;
  id: string;
  plan_json: unknown;
  session_id: string;
  snapshot_json: unknown;
  status: string;
  updated_at: string;
  user_message_id: string | null;
};

const plannerItemSchema = z.object({
  credits: z.number().finite().nonnegative(),
  label: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
});

export const plannerOutputSchema = z.object({
  approvalRequired: z.boolean(),
  costEstimate: z
    .object({
      items: z.array(plannerItemSchema),
      totalCredits: z.number().finite().nonnegative(),
    })
    .optional(),
  evidence: z.array(
    z.object({
      summary: z.string().min(1).max(1000),
      type: z.enum(["canvas", "selection", "asset", "model", "pricing", "run"]),
    }),
  ),
  plan: z.array(
    z.object({
      reason: z.string().min(1).max(1000),
      risk: z.string().min(1).max(1000).optional(),
      step: z.string().min(1).max(300),
    }),
  ),
  proposedOps: z.array(
    z.union([
      z.object({
        type: z.literal("add_node"),
        clientId: z.string().min(1).optional(),
        kind: z.enum(["text", "image", "video", "audio", "upload", "image_editor", "group"]),
        position: z.object({ x: z.number().finite(), y: z.number().finite() }),
        data: z.record(z.string(), z.unknown()),
        selected: z.boolean().optional(),
      }),
      z.object({
        type: z.literal("update_node_data"),
        nodeId: z.string().min(1),
        patch: z.record(z.string(), z.unknown()),
      }),
      z.object({
        type: z.literal("delete_nodes"),
        nodeIds: z.array(z.string().min(1)).min(1),
      }),
      z.object({
        type: z.literal("connect_nodes"),
        source: z.string().min(1),
        target: z.string().min(1),
        sourceHandle: z.string().min(1).optional(),
        targetHandle: z.string().min(1).optional(),
      }),
      z.object({
        type: z.literal("delete_edges"),
        edgeIds: z.array(z.string().min(1)).min(1),
      }),
      z.object({
        type: z.literal("select_nodes"),
        nodeIds: z.array(z.string().min(1)).min(1),
      }),
      z.object({
        type: z.literal("set_viewport"),
        viewport: z.object({
          x: z.number().finite(),
          y: z.number().finite(),
          zoom: z.number().finite().positive(),
        }),
      }),
      z.object({
        type: z.literal("run_node"),
        nodeId: z.string().min(1),
        runMode: z.literal("target_node"),
      }),
    ]),
  ),
  reply: z.string().min(1).max(4000),
});

type PlannerOutput = z.infer<typeof plannerOutputSchema>;

function getCanvasCenter(snapshot: CanvasAgentSnapshotInput) {
  return {
    x: -snapshot.viewport.x / snapshot.viewport.zoom + 160,
    y: -snapshot.viewport.y / snapshot.viewport.zoom + 120,
  };
}

function buildDeterministicPlan(prompt: string, snapshot: CanvasAgentSnapshotInput): PlannerOutput {
  const trimmed = prompt.trim();
  const selectedImage = snapshot.nodes.find((node) => node.selected && node.kind === "image" && node.assetId);
  const center = getCanvasCenter(snapshot);

  if (selectedImage && /video/i.test(trimmed)) {
    return {
      approvalRequired: true,
      evidence: [{ summary: `Selected reference image: ${selectedImage.title}`, type: "selection" }],
      plan: [
        {
          reason: "The user asked to create a video from the current image selection.",
          step: "Create a video generation node.",
        },
        {
          reason: "The selected image should remain as a visible upstream reference.",
          step: "Connect the selected image to the video node.",
        },
      ],
      proposedOps: [
        {
          clientId: "video-target",
          data: { generationPrompt: trimmed, title: "Image to Video" },
          kind: "video",
          position: { x: selectedImage.position.x + 420, y: selectedImage.position.y },
          selected: true,
          type: "add_node",
        },
        {
          source: selectedImage.id,
          sourceHandle: "out",
          target: "client:video-target",
          targetHandle: "in",
          type: "connect_nodes",
        },
      ],
      reply: "Prepare an image-to-video flow from the selected reference image. Confirm to write it to the canvas.",
    };
  }

  return {
    approvalRequired: true,
    evidence: [
      {
        summary: snapshot.nodes.length === 0 ? "The current canvas is empty." : `The current canvas has ${snapshot.nodes.length} nodes.`,
        type: "canvas",
      },
    ],
    plan: [
      {
        reason: "Keep the user's goal as editable text for later refinement.",
        step: "Create a text prompt node.",
      },
      {
        reason: "Use an image node to hold generation settings and results.",
        step: "Create an image generation node.",
      },
      {
        reason: "Make the workflow dependency explicit on the canvas.",
        step: "Connect the text node to the image node.",
      },
    ],
    proposedOps: [
      {
        clientId: "prompt",
        data: { text: trimmed, title: "Agent Prompt" },
        kind: "text",
        position: center,
        type: "add_node",
      },
      {
        clientId: "image-target",
        data: {
          batchCount: 1,
          generationPrompt: trimmed,
          params: { imageSize: "1K" },
          title: "Agent Image Generation",
        },
        kind: "image",
        position: { x: center.x + 380, y: center.y },
        selected: true,
        type: "add_node",
      },
      {
        source: "client:prompt",
        sourceHandle: "out",
        target: "client:image-target",
        targetHandle: "in",
        type: "connect_nodes",
      },
    ],
    reply: "Prepare a basic text-to-image production flow. Confirm to create the nodes and connection.",
  };
}

function sanitizeSnapshot(snapshot: CanvasAgentSnapshotInput): CanvasAgentSnapshotInput {
  return {
    ...snapshot,
    nodeOutputs: Object.fromEntries(
      Object.entries(snapshot.nodeOutputs).map(([nodeId, output]) => [
        nodeId,
        {
          errorMessage: output.errorMessage ? output.errorMessage.slice(0, 500) : null,
          text: output.text ? output.text.slice(0, 1200) : null,
        },
      ]),
    ),
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      errorMessage: node.errorMessage?.slice(0, 500),
      title: node.title.slice(0, 120),
    })),
  };
}

function formatStreamEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export class AgentApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "AgentApiError";
    this.statusCode = statusCode;
  }
}

export class AgentService {
  readonly env: ApiEnv;
  readonly eventService: AgentEventService;
  readonly canvasService: AgentCanvasService;
  readonly executorService: Pick<AgentExecutorService, "approveToolCall" | "executeTurn"> | null;
  readonly plannerService: AgentPlannerService<PlannerOutput>;
  readonly pool: PgPool;
  readonly runSettingsService: Pick<AgentRunSettingsService, "estimateImageRunSettings" | "listImageRunSettings">;
  readonly sessionRepository: AgentSessionRepository;
  readonly textRuntime: Pick<DatabaseTextGenerationRuntime, "generateText">;
  readonly flowsService: Pick<FlowsService, "getFlowDraft" | "saveFlowDraft">;

  constructor(options: {
    aiModelCatalogService?: Pick<AiModelCatalogService, "listModels" | "listRoutesForModel">;
    env: ApiEnv;
    executorService?: Pick<AgentExecutorService, "approveToolCall" | "executeTurn"> | null;
    flowsService: Pick<FlowsService, "getFlowDraft" | "saveFlowDraft">;
    pool?: PgPool;
    runSettingsService: Pick<AgentRunSettingsService, "estimateImageRunSettings" | "listImageRunSettings">;
    canvasService?: AgentCanvasService;
    sessionRepository?: AgentSessionRepository;
    textRuntime?: Pick<DatabaseTextGenerationRuntime, "generateText">;
  }) {
    this.env = options.env;
    this.executorService = options.executorService ?? null;
    this.flowsService = options.flowsService;
    this.pool = options.pool ?? createPgPool();
    this.runSettingsService = options.runSettingsService;
    this.sessionRepository = options.sessionRepository ?? new AgentSessionRepository({ pool: this.pool });
    this.eventService = new AgentEventService({
      pool: this.pool,
      repository: this.sessionRepository,
    });
    this.canvasService = options.canvasService ?? new AgentCanvasService({
      eventRepository: this.sessionRepository,
      flowsService: this.flowsService,
      sessionRepository: this.sessionRepository,
    });
    this.textRuntime =
      options.textRuntime ??
      new DatabaseTextGenerationRuntime({
        credentialVault: {
          getSecretForProviderCall() {
            throw new Error("Credential vault should not be used when agent planner is disabled.");
          },
        } as never,
        pool: this.pool,
      });
    this.plannerService = new AgentPlannerService(this.env, this.textRuntime, plannerOutputSchema);
  }

  async createSession(context: AgentContext, input: CreateAgentSessionInput) {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<AgentSessionRow>(
        `
          INSERT INTO agent_sessions (
            tenant_id,
            project_id,
            flow_id,
            title,
            created_by,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, now())
          RETURNING
            id::text AS id,
            project_id::text AS project_id,
            flow_id::text AS flow_id,
            title,
            status,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          context.tenantId,
          input.projectId ?? null,
          input.flowId ?? null,
          input.title?.trim() || "Canvas Agent",
          context.userId,
        ],
      );
      return this.mapSession(result.rows[0]!);
    }, this.pool);
  }

  async getSession(context: AgentContext, sessionId: string) {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<AgentSessionRow>(
        `
          SELECT
            id::text AS id,
            project_id::text AS project_id,
            flow_id::text AS flow_id,
            title,
            status,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM agent_sessions
          WHERE id = $1::uuid
          LIMIT 1
        `,
        [sessionId],
      );

      if (result.rowCount === 0) {
        throw new AgentApiError(404, "AGENT_SESSION_NOT_FOUND", "Agent session not found.");
      }

      return this.mapSession(result.rows[0]!);
    }, this.pool);
  }

  async listSessions(
    context: AgentContext,
    filter: { flowId?: string | null; limit?: number; projectId?: string | null },
  ) {
    try {
      return await this.sessionRepository.listSessions(context, filter);
    } catch (error) {
      return toAgentRepositoryError(error);
    }
  }

  async getSessionHistory(context: AgentContext, sessionId: string) {
    try {
      return await this.sessionRepository.getSessionHistory(context, sessionId);
    } catch (error) {
      return toAgentRepositoryError(error);
    }
  }

  async getSessionEvents(context: AgentContext, sessionId: string, afterSeq = 0) {
    try {
      return await this.eventService.getReplay(context, sessionId, afterSeq);
    } catch (error) {
      return toAgentRepositoryError(error);
    }
  }

  async listImageRunSettings(context: AgentContext) {
    return this.runSettingsService.listImageRunSettings(context);
  }

  async estimateImageRunSettings(
    context: AgentContext,
    input: {
      routeKey: string;
      size: "1K" | "2K" | "4K";
    },
  ) {
    return this.runSettingsService.estimateImageRunSettings(context, input);
  }

  async buildSessionEventsStream(context: AgentContext, sessionId: string, afterSeq = 0) {
    try {
      return await this.eventService.buildReplayStream(context, sessionId, afterSeq);
    } catch (error) {
      return toAgentRepositoryError(error);
    }
  }

  async appendMessage(
    context: AgentContext,
    sessionId: string,
    input: { content: string; metadata?: Record<string, unknown> },
  ) {
    try {
      return await this.sessionRepository.appendUserMessage(context, sessionId, input);
    } catch (error) {
      return toAgentRepositoryError(error);
    }
  }

  async applyCanvasOps(
    context: AgentContext,
    sessionId: string,
    input: {
      expectedRevision?: number;
      flowId: string;
      ops: Array<{
        [key: string]: unknown;
        type: string;
      }>;
      turnId: string;
    },
  ) {
    return this.canvasService.applyOps(context, sessionId, input as Parameters<AgentCanvasService["applyOps"]>[2]);
  }

  async createTurn(context: AgentContext, sessionId: string, input: CreateAgentTurnInput) {
    return withTenantTransaction(context, async (client) => {
      const session = await this.requireSession(client, sessionId);
      const snapshot = sanitizeSnapshot(input.snapshot);
      const prompt = input.prompt.trim();
      const plan = await this.planTurn(context, prompt, snapshot);

      const userMessageId = await this.insertMessage(client, {
        content: prompt,
        role: "user",
        sessionId,
        tenantId: context.tenantId,
      });
      const assistantMessageId = await this.insertMessage(client, {
        content: plan.reply,
        metadata: { approvalRequired: plan.approvalRequired },
        role: "assistant",
        sessionId,
        tenantId: context.tenantId,
      });

      const turn = await client.query<AgentTurnRow>(
        `
          INSERT INTO agent_turns (
            tenant_id,
            session_id,
            user_message_id,
            assistant_message_id,
            status,
            snapshot_json,
            plan_json,
            error_json,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'planned', $5::jsonb, $6::jsonb, $7::jsonb, now())
          RETURNING
            id::text AS id,
            session_id::text AS session_id,
            user_message_id::text AS user_message_id,
            assistant_message_id::text AS assistant_message_id,
            status,
            snapshot_json,
            plan_json,
            error_json,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          context.tenantId,
          sessionId,
          userMessageId,
          assistantMessageId,
          JSON.stringify(snapshot),
          JSON.stringify(plan),
          JSON.stringify({
            fallbackUsed: false,
            plannerMode: this.env.agentPlannerEnabled ? "llm" : "deterministic",
          }),
        ],
      );

      await client.query(
        `UPDATE agent_sessions SET updated_at = now(), title = COALESCE(NULLIF(title, ''), $2) WHERE id = $1::uuid`,
        [session.id, session.title],
      );

      return {
        ...plan,
        sessionId,
        turnId: turn.rows[0]!.id,
      };
    }, this.pool);
  }

  async buildTurnStream(context: AgentContext, sessionId: string, input: CreateAgentTurnInput) {
    const result = await this.createTurn(context, sessionId, input);
    return [
      formatStreamEvent("message", { role: "assistant", content: result.reply }),
      formatStreamEvent("plan", result),
      formatStreamEvent("done", { sessionId: result.sessionId, turnId: result.turnId }),
    ].join("");
  }

  async buildExecuteTurnStream(context: AgentContext, sessionId: string, input: CreateAgentTurnInput) {
    const chunks: string[] = [];
    await this.streamExecuteTurnEvents(context, sessionId, input, (chunk) => {
      chunks.push(chunk);
    });
    return chunks.join("");
  }

  async streamExecuteTurnEvents(
    context: AgentContext,
    sessionId: string,
    input: CreateAgentTurnInput,
    writeChunk: (chunk: string) => void | Promise<void>,
  ) {
    if (!this.env.agentExecutorEnabled) {
      throw new AgentApiError(503, "AGENT_EXECUTOR_DISABLED", "Agent executor is disabled.");
    }
    if (!this.executorService) {
      throw new AgentApiError(503, "AGENT_EXECUTOR_NOT_CONFIGURED", "Agent executor is not configured.");
    }

    try {
      await this.executorService.executeTurn(context, {
        ...input,
        onEvent: async (event) => {
          await this.eventService.appendToolEvent(context, sessionId, event);
          await writeChunk(formatAgentToolEvent(event));
        },
        sessionId,
      });
    } catch (error) {
      throw normalizeAgentExecutorApiError(error);
    }
  }

  async buildApproveToolCallStream(context: AgentContext, sessionId: string, input: ApproveAgentToolCallInput) {
    const chunks: string[] = [];
    await this.streamApproveToolCallEvents(context, sessionId, input, (chunk) => {
      chunks.push(chunk);
    });
    return chunks.join("");
  }

  async streamApproveToolCallEvents(
    context: AgentContext,
    sessionId: string,
    input: ApproveAgentToolCallInput,
    writeChunk: (chunk: string) => void | Promise<void>,
  ) {
    if (!this.env.agentExecutorEnabled) {
      throw new AgentApiError(503, "AGENT_EXECUTOR_DISABLED", "Agent executor is disabled.");
    }
    if (!this.executorService) {
      throw new AgentApiError(503, "AGENT_EXECUTOR_NOT_CONFIGURED", "Agent executor is not configured.");
    }

    try {
      await this.executorService.approveToolCall(context, {
        ...input,
        onEvent: async (event) => {
          await this.eventService.appendToolEvent(context, sessionId, event);
          await writeChunk(formatAgentToolEvent(event));
        },
        sessionId,
      });
    } catch (error) {
      throw normalizeAgentExecutorApiError(error);
    }
  }

  private async planTurn(context: AgentContext, prompt: string, snapshot: CanvasAgentSnapshotInput): Promise<PlannerOutput> {
    if (!this.env.agentPlannerEnabled) {
      if (isProductionImageAgentPrompt(prompt)) {
        throw new AgentApiError(
          503,
          "AGENT_EXECUTOR_REQUIRED",
          "真实 Agent 执行器不可用，无法完成生成、对比或套图类生产任务。请先启用 Agent Executor、文本大脑模型和生图线路。",
        );
      }
      return buildDeterministicPlan(prompt, snapshot);
    }

    try {
      return await this.plannerService.planWithLlm(context, prompt, snapshot);
    } catch (error) {
      if (error instanceof AgentPlannerRuntimeError) {
        if (this.env.agentPlannerFallbackEnabled) {
          if (isProductionImageAgentPrompt(prompt)) {
            throw new AgentApiError(
              503,
              "AGENT_EXECUTOR_REQUIRED",
              "真实 Agent 执行器不可用，无法完成生成、对比或套图类生产任务。请先启用 Agent Executor、文本大脑模型和生图线路。",
            );
          }
          return buildDeterministicPlan(prompt, snapshot);
        }
        const statusCode = error.code === "AGENT_TEXT_ROUTE_NOT_CONFIGURED" ? 500 : 502;
        throw new AgentApiError(statusCode, error.code, error.message);
      }
      throw new AgentApiError(502, "AGENT_PLANNER_RUNTIME_FAILED", error instanceof Error ? error.message : String(error));
    }
  }

  private async requireSession(client: PoolClient, sessionId: string) {
    const result = await client.query<AgentSessionRow>(
      `
        SELECT
          id::text AS id,
          project_id::text AS project_id,
          flow_id::text AS flow_id,
          title,
          status,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM agent_sessions
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [sessionId],
    );

    if (result.rowCount === 0) {
      throw new AgentApiError(404, "AGENT_SESSION_NOT_FOUND", "Agent session not found.");
    }

    return result.rows[0]!;
  }

  private async insertMessage(client: PoolClient, input: {
    content: string;
    metadata?: Record<string, unknown>;
    role: "assistant" | "system" | "user";
    sessionId: string;
    tenantId: string;
  }) {
    const result = await client.query<{ id: string }>(
      `
        INSERT INTO agent_messages (
          tenant_id,
          session_id,
          role,
          content,
          metadata_json
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb)
        RETURNING id::text AS id
      `,
      [
        input.tenantId,
        input.sessionId,
        input.role,
        input.content,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return result.rows[0]!.id;
  }

  private mapSession(row: AgentSessionRow) {
    return {
      createdAt: row.created_at,
      flowId: row.flow_id,
      id: row.id,
      projectId: row.project_id,
      status: row.status,
      title: row.title,
      updatedAt: row.updated_at,
    };
  }
}

function normalizeAgentExecutorApiError(error: unknown): AgentApiError {
  if (error instanceof AgentExecutorError || error instanceof AgentReferenceResolutionError) {
    return new AgentApiError(error.statusCode, error.code, error.message);
  }
  throw error;
}
