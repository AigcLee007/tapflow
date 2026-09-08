import { DatabaseTextGenerationRuntime } from "@aigc-flow/ai-gateway-core";
import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { ApiEnv } from "../../config/env.js";
import { AgentPlannerRuntimeError, AgentPlannerService } from "./agent-planner.service.js";
import { AgentExecutorError, type AgentExecutorService } from "./agent-executor.service.js";
import { AgentReferenceResolutionError } from "./agent-reference-context.js";
import { AgentCanvasService } from "./agent-canvas.service.js";
import { isProductionImageAgentPrompt } from "./agent-production-intent.js";
import { AgentEventService, toAgentRepositoryError } from "./agent-event.service.js";
import { sanitizeV2AgentEventForClient } from "./agent-redaction.js";
import { buildSkillLaunchApprovalPlan, type SkillLaunchApprovalPlan } from "./agent-skill-approval-plan.js";
import type { AgentRunSettingsService } from "./agent-run-settings.service.js";
import { AgentSessionRepository } from "./agent-session.repository.js";
import { buildScopedV2AgentContext } from "./agent-v2-context.js";
import { resolveAgentRuntimeIdentity } from "./agent-runtime-identity.js";
import { formatAgentToolEvent } from "./agent-tool-events.js";
import type { AiModelCatalogService } from "../ai-model-catalog/ai-model-catalog.service.js";
import type { FlowsService } from "../flows/flows.service.js";
import type {
  ApproveAgentToolCallInput,
  CreateAgentV5DecisionInput,
  CreateAgentV5TurnInput,
  CanvasAgentSnapshotInput,
  CreateAgentSessionInput,
  CreateAgentTurnInput,
  AgentSessionScopeInput,
  CancelAgentTurnInput,
} from "./agent.schemas.js";
import { V2AgentTurnLoop, type V2AgentToolExecution } from "./v2/agent-turn-loop.js";
import { V2WorkflowRunAdapter } from "./v2/v2-workflow-run-adapter.js";
import type { SkillService } from "./skill.service.js";
import type { SkillRunService } from "./agent-skill-run.service.js";

type PgPool = Pool;

type AgentContext = {
  tenantId: string;
  userId: string | null;
};

type V2AgentStreamingRuntime = {
  getTextStreamingCapabilities?: (
    context: AgentContext,
    routeKey: string | null,
  ) => Promise<{ supportsTextStreaming: boolean; supportsToolCalling: boolean }>;
  streamText?: (...args: never[]) => unknown;
};

type AgentSessionRow = {
  created_at: string;
  conversation_phase?: string;
  execution_mode?: "auto" | "manual_confirmation";
  flow_id: string | null;
  id: string;
  project_id: string | null;
  status: string;
  title: string;
  updated_at: string;
};

type AgentSessionScope = Pick<AgentSessionScopeInput, "projectId" | "flowId">;

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

type V5Block = Record<string, unknown>;

type V5TurnRow = {
  blocks_json: unknown;
  conversation_phase: string;
  execution_state: string;
  graph_revision: string | null;
  id: string;
  plan_json: unknown;
  requires_confirmation: boolean;
  session_id: string;
};

function isV5Block(value: unknown): value is V5Block {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && typeof (value as { type?: unknown }).type === "string";
}

function v5Blocks(value: unknown): V5Block[] {
  return Array.isArray(value) ? value.filter(isV5Block) : [];
}

function choiceGrid(blocks: V5Block[], id: string): V5Block | null {
  return blocks.find((block) => block.type === "choice_grid" && block.id === id) ?? null;
}

function choiceOption(block: V5Block | null, optionId: string): V5Block | null {
  if (!block || !Array.isArray(block.options)) return null;
  return block.options.find((option) => isV5Block(option) && option.id === optionId) ?? null;
}

function optionLabel(block: V5Block | null, optionId: string): string | null {
  const option = choiceOption(block, optionId);
  return typeof option?.label === "string" ? option.label : null;
}

function v5InitialBlocks(): V5Block[] {
  return [
    { type: "paragraph", text: "我先确认产品方向，再开始设计。" },
    { type: "heading", level: 2, text: "先确定设计方向" },
    {
      type: "choice_grid",
      id: "direction",
      title: "你更想优先解决哪件事？",
      selectionMode: "single",
      options: [
        { id: "comfort", label: "陪伴与情绪安抚", description: "让孩子获得稳定、被陪伴的体验。" },
        { id: "learning", label: "成长与启蒙互动", description: "把探索、表达和认知融入日常互动。" },
        { id: "routine", label: "习惯与日常陪伴", description: "帮助建立起床、收纳或睡前等日常节奏。" },
      ],
    },
  ];
}

function v5AgeBlocks(): V5Block[] {
  return [
    { type: "paragraph", text: "方向已确定。再确认适用年龄，我会据此调整互动方式与安全边界。" },
    { type: "heading", level: 2, text: "选择适用年龄" },
    {
      type: "choice_grid",
      id: "age",
      title: "这款玩具主要陪伴哪个年龄段？",
      selectionMode: "single",
      options: [
        { id: "0-3", label: "0-3 岁", description: "感官陪伴与亲子共玩为主。" },
        { id: "3-6", label: "3-6 岁", description: "角色互动、表达和习惯培养为主。" },
        { id: "6-9", label: "6-9 岁", description: "任务探索与自主互动为主。" },
      ],
    },
  ];
}

function v5BriefBlocks(input: { age: string; direction: string; goal: string }): V5Block[] {
  return [
    { type: "heading", level: 2, text: "共创 Brief" },
    {
      type: "brief_card",
      title: "当前设计 Brief",
      editable: true,
      fields: [
        { label: "产品目标", value: input.goal },
        { label: "优先方向", value: input.direction },
        { label: "适用年龄", value: input.age },
        { label: "下一步", value: "输出儿童陪伴玩具的概念方案与互动设计。" },
      ],
    },
    {
      type: "confirmation_card",
      title: "确认并开始设计",
      text: "请确认这份 Brief。确认后将进入设计准备队列。",
      plan: {
        summary: "儿童陪伴玩具概念设计",
        writesCanvas: false,
      },
    },
  ];
}

function parseSkillLaunchApprovalPlan(value: unknown): SkillLaunchApprovalPlan {
  if (!value || typeof value !== "object") throw new AgentApiError(409, "SKILL_RUN_STALE_APPROVAL", "Skill approval plan is missing or invalid.");
  const input = value as Record<string, unknown>;
  const targets = Array.isArray(input.targets) ? input.targets : [];
  const graphRevisionValue = input.graphRevision;
  if (typeof input.flowId !== "string" || typeof graphRevisionValue !== "number" || !Number.isSafeInteger(graphRevisionValue) || graphRevisionValue < 0 || targets.length === 0) {
    throw new AgentApiError(409, "SKILL_RUN_STALE_APPROVAL", "Skill approval plan is missing or invalid.");
  }
  const graphRevision = graphRevisionValue;
  const normalizedTargets = targets.map((target) => {
    if (!target || typeof target !== "object") throw new AgentApiError(409, "SKILL_RUN_STALE_APPROVAL", "Skill approval plan is invalid.");
    const item = target as Record<string, unknown>;
    if (typeof item.nodeId !== "string" || !["text", "image", "video"].includes(String(item.action)) || typeof item.priced !== "boolean") {
      throw new AgentApiError(409, "SKILL_RUN_STALE_APPROVAL", "Skill approval plan is invalid.");
    }
    return { nodeId: item.nodeId, action: item.action as "text" | "image" | "video", priced: item.priced };
  });
  return {
    batch: normalizedTargets.length > 1,
    flowId: input.flowId,
    graphRevision,
    requiresApproval: true,
    targets: normalizedTargets,
  };
}

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

function buildAgentV5Blocks(plan: PlannerOutput) {
  const blocks: Array<Record<string, unknown>> = [
    { type: "paragraph", text: plan.reply },
  ];
  if (plan.plan.length > 0) {
    blocks.push({ type: "heading", level: 2, text: "执行方案" });
    blocks.push({ type: "numbered_list", items: plan.plan.map((step) => step.step) });
  }
  if (plan.approvalRequired) {
    blocks.push({
      type: "confirmation_card",
      title: "确认并开始执行",
      text: "确认后 Agent 才会执行画布操作或生成任务。",
      plan: {
        costCredits: plan.costEstimate?.totalCredits ?? 0,
        batch: false,
        writesCanvas: plan.proposedOps.length > 0,
      },
    });
  }
  return blocks;
}

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

/**
 * Keep the V2 entrypoint fail-closed even when a custom runtime is injected in
 * tests or another deployment. The route-specific checker is deliberately
 * required: a stream function alone cannot prove native tool support.
 */
export async function assertV2AgentStreamingCapabilities(
  runtime: V2AgentStreamingRuntime,
  context: AgentContext,
  routeKey: string | null | undefined,
): Promise<void> {
  if (typeof runtime.streamText !== "function" || typeof runtime.getTextStreamingCapabilities !== "function") {
    throw new AgentApiError(
      400,
      "AGENT_ROUTE_CAPABILITY_REQUIRED",
      "The selected AI route does not support native Agent streaming.",
    );
  }

  try {
    const capabilities = await runtime.getTextStreamingCapabilities(context, routeKey?.trim() || null);
    if (!capabilities.supportsTextStreaming || !capabilities.supportsToolCalling) {
      throw new AgentApiError(
        400,
        "AGENT_ROUTE_CAPABILITY_REQUIRED",
        "The selected AI route does not support native Agent streaming.",
      );
    }
  } catch (error) {
    if (error instanceof AgentApiError) throw error;
    // Never forward gateway route/provider details to creator-facing API/SSE.
    if (error && typeof error === "object" && "code" in error && ["AGENT_ROUTE_CAPABILITY_REQUIRED", "ROUTE_NOT_FOUND"].includes(String((error as { code?: unknown }).code))) {
      throw new AgentApiError(
        400,
        "AGENT_ROUTE_CAPABILITY_REQUIRED",
        "The selected AI route does not support native Agent streaming.",
      );
    }
    throw error;
  }
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
  readonly aiModelCatalogService: Pick<AiModelCatalogService, "listModels" | "listRoutesForModel"> | null;
  readonly executorService: Pick<AgentExecutorService, "approveToolCall" | "executeTurn"> | null;
  readonly plannerService: AgentPlannerService<PlannerOutput>;
  readonly pool: PgPool;
  readonly runSettingsService: Pick<AgentRunSettingsService, "estimateImageRunSettings" | "listImageRunSettings">;
  readonly sessionRepository: AgentSessionRepository;
  readonly textRuntime: Pick<DatabaseTextGenerationRuntime, "generateText"> & Partial<Pick<DatabaseTextGenerationRuntime, "streamText">>;
  readonly flowsService: Pick<FlowsService, "getFlowDraft" | "saveFlowDraft">;
  readonly skillService: Pick<SkillService, "getPublishedVersion" | "getPublishedVersionByNumber"> | null;
  readonly skillRunService: Pick<SkillRunService, "createRun" | "getRun" | "transition" | "createStep" | "updateStep" | "replaceBudgetSnapshot" | "claimApprovalLaunch" | "approve" | "cancel"> | null;
  readonly workflowRunAdapter: V2WorkflowRunAdapter | null;

  constructor(options: {
    aiModelCatalogService?: Pick<AiModelCatalogService, "listModels" | "listRoutesForModel">;
    env: ApiEnv;
    executorService?: Pick<AgentExecutorService, "approveToolCall" | "executeTurn"> | null;
    flowsService: Pick<FlowsService, "getFlowDraft" | "saveFlowDraft">;
    pool?: PgPool;
    runSettingsService: Pick<AgentRunSettingsService, "estimateImageRunSettings" | "listImageRunSettings">;
    canvasService?: AgentCanvasService;
    sessionRepository?: AgentSessionRepository;
    textRuntime?: Pick<DatabaseTextGenerationRuntime, "generateText"> & Partial<Pick<DatabaseTextGenerationRuntime, "streamText">>;
    skillService?: Pick<SkillService, "getPublishedVersion" | "getPublishedVersionByNumber"> | null;
    skillRunService?: Pick<SkillRunService, "createRun" | "getRun" | "transition" | "createStep" | "updateStep" | "replaceBudgetSnapshot" | "claimApprovalLaunch" | "approve" | "cancel"> | null;
    workflowRunsService?: Pick<import("../workflow-runs/workflow-runs.service.js").WorkflowRunsService, "createWorkflowRun" | "getWorkflowRunStatus" | "getWorkflowRun">;
  }) {
    this.env = options.env;
    this.aiModelCatalogService = options.aiModelCatalogService ?? null;
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
    this.skillService = options.skillService ?? null;
    this.skillRunService = options.skillRunService ?? null;
    this.workflowRunAdapter = options.workflowRunsService
      ? new V2WorkflowRunAdapter({
        getFlowRevision: async (ctx, flowId) => (await this.flowsService.getFlowDraft(ctx, flowId)).revision,
        workflowRuns: options.workflowRunsService,
      })
      : null;
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

  async getSession(context: AgentContext, sessionId: string, scope: AgentSessionScope = {}) {
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
      this.assertSessionScope({ projectId: result.rows[0]!.project_id, flowId: result.rows[0]!.flow_id }, scope);
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

  async getSessionHistory(context: AgentContext, sessionId: string, scope: AgentSessionScope = {}) {
    try {
      const session = await this.sessionRepository.getSession(context, sessionId);
      this.assertSessionScope({ projectId: session.projectId, flowId: session.flowId }, scope);
      return await this.sessionRepository.getSessionHistory(context, sessionId);
    } catch (error) {
      return toAgentRepositoryError(error);
    }
  }

  async getSessionEvents(context: AgentContext, sessionId: string, afterSeq = 0, scope: AgentSessionScope = {}) {
    try {
      const session = await this.sessionRepository.getSession(context, sessionId);
      this.assertSessionScope({ projectId: session.projectId, flowId: session.flowId }, scope);
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

  async buildSessionEventsStream(context: AgentContext, sessionId: string, afterSeq = 0, scope: AgentSessionScope = {}) {
    const session = await this.sessionRepository.getSession(context, sessionId);
    this.assertSessionScope(session, scope);
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
      const blocks = buildAgentV5Blocks(plan);
      const conversationPhase = plan.approvalRequired ? "waiting_for_confirmation" : "idle";

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
            blocks_json,
            conversation_phase,
            execution_state,
            snapshot_json,
            plan_json,
            error_json,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'planned', $5::jsonb, $6, 'idle', $7::jsonb, $8::jsonb, $9::jsonb, now())
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
          JSON.stringify(blocks),
          conversationPhase,
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
        blocks,
        phase: conversationPhase,
        sessionId,
        turnId: turn.rows[0]!.id,
      };
    }, this.pool);
  }

  async createV5Turn(context: AgentContext, sessionId: string, input: CreateAgentV5TurnInput) {
    return withTenantTransaction(context, async (client) => {
      const session = await this.requireSession(client, sessionId, true);
      this.assertV5SessionSnapshot(session, input);

      // Serialize requests with the same tenant/idempotency key before any
      // messages are written. The partial unique index remains the durable
      // backstop, while this keeps concurrent retries from creating orphans.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`${context.tenantId}:${input.idempotencyKey}`],
      );

      const existing = await client.query<V5TurnRow>(
        `
          SELECT
            id::text AS id,
            session_id::text AS session_id,
            blocks_json,
            conversation_phase,
            execution_state,
            graph_revision::text AS graph_revision,
            plan_json,
            requires_confirmation
          FROM agent_turns
          WHERE tenant_id = $1::uuid
            AND agent_version = 'v5'
            AND idempotency_key = $2
          LIMIT 1
        `,
        [context.tenantId, input.idempotencyKey],
      );
      if ((existing.rowCount ?? 0) > 0) {
        const turn = existing.rows[0]!;
        if (turn.session_id !== sessionId) {
          throw new AgentApiError(409, "AGENT_TURN_IDEMPOTENCY_CONFLICT", "This request key is already associated with another conversation.");
        }
        return this.projectV5Turn({ ...turn, sessionId });
      }

      if (session.flow_id) {
        const draft = await this.flowsService.getFlowDraft(context, session.flow_id);
        if (draft.revision !== input.contextSnapshot.graphRevision) {
          throw new AgentApiError(409, "FLOW_DRAFT_REVISION_CONFLICT", "画布已被其他修改，请刷新后重试。");
        }
      }

      const prompt = input.prompt.trim();
      const blocks = v5InitialBlocks();
      const userMessageId = await this.insertMessage(client, {
        content: prompt,
        role: "user",
        sessionId,
        tenantId: context.tenantId,
      });
      const assistantMessageId = await this.insertMessage(client, {
        content: "我先确认产品方向，再开始设计。",
        metadata: { agentVersion: "v5", phase: "waiting_for_choice" },
        role: "assistant",
        sessionId,
        tenantId: context.tenantId,
      });

      const inserted = await client.query<V5TurnRow>(
        `
          INSERT INTO agent_turns (
            tenant_id,
            session_id,
            user_message_id,
            assistant_message_id,
            status,
            agent_namespace,
            agent_version,
            idempotency_key,
            graph_revision,
            snapshot_json,
            context_snapshot_json,
            plan_json,
            blocks_json,
            conversation_phase,
            execution_state,
            requires_confirmation,
            result_ids_json,
            error_json,
            updated_at
          )
          VALUES (
            $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'planned', 'canvas_agent', 'v5', $5,
            $6::bigint, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, 'waiting_for_choice', 'idle', false,
            '[]'::jsonb, NULL, now()
          )
          ON CONFLICT (tenant_id, idempotency_key) WHERE agent_version = 'v5' AND idempotency_key IS NOT NULL DO NOTHING
          RETURNING
            id::text AS id,
            session_id::text AS session_id,
            blocks_json,
            conversation_phase,
            execution_state,
            graph_revision::text AS graph_revision,
            plan_json,
            requires_confirmation
        `,
        [
          context.tenantId,
          sessionId,
          userMessageId,
          assistantMessageId,
          input.idempotencyKey,
          input.contextSnapshot.graphRevision,
          JSON.stringify(sanitizeSnapshot(input.snapshot)),
          JSON.stringify(input.contextSnapshot),
          JSON.stringify({
            v5Conversation: {
              goal: prompt.slice(0, 500),
              mode: input.mode,
              modelKey: input.modelKey,
              referenceCount: input.referenceContext.items.length,
            },
          }),
          JSON.stringify(blocks),
        ],
      );

      if (inserted.rowCount === 0) {
        const replay = await client.query<V5TurnRow>(
          `
            SELECT id::text AS id, session_id::text AS session_id, blocks_json, conversation_phase,
              execution_state, graph_revision::text AS graph_revision, plan_json, requires_confirmation
            FROM agent_turns
            WHERE tenant_id = $1::uuid AND agent_version = 'v5' AND idempotency_key = $2
            LIMIT 1
          `,
          [context.tenantId, input.idempotencyKey],
        );
        const turn = replay.rows[0];
        if (!turn || turn.session_id !== sessionId) {
          throw new AgentApiError(409, "AGENT_TURN_IDEMPOTENCY_CONFLICT", "This request key is already associated with another conversation.");
        }
        return this.projectV5Turn({ ...turn, sessionId });
      }

      await client.query(
        `
          UPDATE agent_sessions
          SET execution_mode = $2, conversation_phase = 'waiting_for_choice', updated_at = now()
          WHERE id = $1::uuid
        `,
        [sessionId, input.mode],
      );
      return this.projectV5Turn({ ...inserted.rows[0]!, sessionId });
    }, this.pool);
  }

  async setV5ExecutionMode(context: AgentContext, sessionId: string, input: { mode: "auto" | "manual_confirmation" } & AgentSessionScopeInput) {
    const session = await this.sessionRepository.getSession(context, sessionId);
    this.assertSessionScope(session, input);
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<AgentSessionRow>(
        `
          UPDATE agent_sessions
          SET execution_mode = $2, updated_at = now()
          WHERE id = $1::uuid
          RETURNING id::text AS id, project_id::text AS project_id, flow_id::text AS flow_id, title, status,
            execution_mode, conversation_phase, created_at::text AS created_at, updated_at::text AS updated_at
        `,
        [sessionId, input.mode],
      );
      if (result.rowCount === 0) throw new AgentApiError(404, "AGENT_SESSION_NOT_FOUND", "Agent session not found.");
      return this.mapSession(result.rows[0]!);
    }, this.pool);
  }

  async recordV5Decision(context: AgentContext, sessionId: string, turnId: string, decision: CreateAgentV5DecisionInput, scope: AgentSessionScopeInput = {}) {
    return withTenantTransaction(context, async (client) => {
      const session = await this.requireSession(client, sessionId, true);
      this.assertSessionScope({ projectId: session.project_id, flowId: session.flow_id }, scope);
      const found = await client.query<V5TurnRow>(
        `
          SELECT id::text AS id, session_id::text AS session_id, blocks_json, conversation_phase,
            execution_state, graph_revision::text AS graph_revision, plan_json, requires_confirmation
          FROM agent_turns
          WHERE tenant_id = $1::uuid AND id = $2::uuid AND session_id = $3::uuid AND agent_version = 'v5'
          FOR UPDATE
        `,
        [context.tenantId, turnId, sessionId],
      );
      if (found.rowCount === 0) throw new AgentApiError(404, "AGENT_TURN_NOT_FOUND", "Agent turn not found.");

      const turn = found.rows[0]!;
      const fromPhase = turn.conversation_phase;
      const blocks = v5Blocks(turn.blocks_json);
      const plan = this.v5PlanState(turn.plan_json);
      let nextBlocks = blocks;
      let nextPhase = fromPhase;
      let nextExecutionState = turn.execution_state;
      let requiresConfirmation = turn.requires_confirmation;
      let confirmed = false;

      if (decision.type === "select_choice") {
        if (fromPhase !== "waiting_for_choice") {
          throw new AgentApiError(409, "AGENT_DECISION_STALE", "This choice is no longer available.");
        }
        const grid = choiceGrid(blocks, decision.blockId);
        const selectedLabel = optionLabel(grid, decision.optionId);
        if (!selectedLabel) {
          throw new AgentApiError(409, "AGENT_DECISION_STALE", "This choice is no longer available.");
        }

        if (decision.blockId === "direction") {
          if (plan.direction) throw new AgentApiError(409, "AGENT_DECISION_STALE", "The design direction is already selected.");
          plan.direction = { id: decision.optionId, label: selectedLabel };
          nextBlocks = [...blocks, ...v5AgeBlocks()];
        } else if (decision.blockId === "age") {
          if (!plan.direction || plan.age) throw new AgentApiError(409, "AGENT_DECISION_STALE", "The age range is not ready to be selected.");
          plan.age = { id: decision.optionId, label: selectedLabel };
          nextBlocks = [...blocks, ...v5BriefBlocks({
            age: selectedLabel,
            direction: plan.direction.label,
            goal: plan.goal,
          })];
          nextPhase = "waiting_for_confirmation";
          requiresConfirmation = true;
        } else {
          throw new AgentApiError(409, "AGENT_DECISION_STALE", "This choice is no longer available.");
        }
      } else if (decision.type === "update_brief") {
        if (fromPhase !== "waiting_for_confirmation") {
          throw new AgentApiError(409, "AGENT_DECISION_STALE", "The brief is not ready to edit.");
        }
        const field = this.v5BriefFieldLabel(decision.field);
        const briefIndex = blocks.findIndex((block) => block.type === "brief_card");
        if (!field || briefIndex < 0) throw new AgentApiError(409, "AGENT_DECISION_STALE", "The brief is not ready to edit.");
        const brief = blocks[briefIndex]!;
        const fields = Array.isArray(brief.fields) ? brief.fields.filter(isV5Block) : [];
        const fieldIndex = fields.findIndex((item) => item.label === field);
        if (fieldIndex < 0) throw new AgentApiError(409, "AGENT_DECISION_STALE", "This brief field is no longer available.");
        const editedFields = fields.map((item, index) => index === fieldIndex ? { ...item, value: decision.value.trim() } : item);
        nextBlocks = blocks.map((block, index) => index === briefIndex ? { ...brief, fields: editedFields } : block);
        requiresConfirmation = nextBlocks.some((block) => block.type === "confirmation_card");
      } else if (decision.type === "confirm") {
        if (fromPhase !== "waiting_for_confirmation" || !turn.requires_confirmation || !blocks.some((block) => block.type === "confirmation_card")) {
          throw new AgentApiError(409, "AGENT_DECISION_STALE", "There is no current design confirmation to accept.");
        }
        await this.assertV5GraphRevision(context, client, session, turn.graph_revision);
        nextPhase = "executing";
        nextExecutionState = "queued";
        requiresConfirmation = false;
        confirmed = true;
        nextBlocks = [...blocks, {
          type: "paragraph",
          text: "设计准备已进入队列，尚未启动生成任务。",
        }];
      } else if (decision.type === "cancel") {
        if (["executing", "presenting_results"].includes(fromPhase)) {
          throw new AgentApiError(409, "AGENT_DECISION_STALE", "This design can no longer be cancelled from the conversation.");
        }
        nextPhase = "idle";
        nextExecutionState = "idle";
        requiresConfirmation = false;
        nextBlocks = [...blocks, { type: "paragraph", text: "已取消当前设计准备。" }];
      } else if (decision.type === "refine") {
        if (fromPhase === "executing") throw new AgentApiError(409, "AGENT_DECISION_STALE", "The design is already queued.");
        nextPhase = "refining";
        nextBlocks = [...blocks, { type: "paragraph", text: "我会根据你的补充继续完善 Brief。" }];
      }

      await client.query(
        `
          UPDATE agent_turns
          SET blocks_json = $3::jsonb,
            plan_json = $4::jsonb,
            conversation_phase = $5,
            execution_state = $6,
            requires_confirmation = $7,
            confirmed_at = CASE WHEN $8 THEN now() WHEN $5 = 'idle' THEN NULL ELSE confirmed_at END,
            updated_at = now()
          WHERE id = $1::uuid AND session_id = $2::uuid
        `,
        [turnId, sessionId, JSON.stringify(nextBlocks), JSON.stringify({ v5Conversation: plan }), nextPhase, nextExecutionState, requiresConfirmation, confirmed],
      );
      await client.query(
        `UPDATE agent_sessions SET conversation_phase = $2, updated_at = now() WHERE id = $1::uuid`,
        [sessionId, nextPhase],
      );
      await client.query(
        `
          INSERT INTO agent_v5_decisions (tenant_id, session_id, turn_id, decision_json, from_phase, to_phase, created_by)
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::jsonb, $5, $6, $7::uuid)
        `,
        [context.tenantId, sessionId, turnId, JSON.stringify(decision), fromPhase, nextPhase, context.userId],
      );

      return this.projectV5Turn({
        ...turn,
        blocks_json: nextBlocks,
        conversation_phase: nextPhase,
        execution_state: nextExecutionState,
        requires_confirmation: requiresConfirmation,
        plan_json: { v5Conversation: plan },
        sessionId,
      });
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

  async streamV2TurnEvents(
    context: AgentContext,
    sessionId: string,
    input: CreateAgentTurnInput & { routeKey?: string; idempotencyKey?: string },
    writeChunk: (chunk: string) => void | Promise<void>,
  ) {
    if (resolveAgentRuntimeIdentity(this.env) !== "v2_real") {
      throw new AgentApiError(404, "AGENT_V2_DISABLED", "Canvas Agent v2 is disabled.");
    }
    if (input.selectedSkillId && (!this.env.agentSkillsEnabled || !this.env.agentSkillRuntimeEnabled)) {
      throw new AgentApiError(404, "SKILL_RUNTIME_DISABLED", "Skill runtime is disabled.");
    }
    await assertV2AgentStreamingCapabilities(this.textRuntime, context, input.routeKey);
    const session = await this.sessionRepository.getSession(context, sessionId);
    if (!session.flowId || input.snapshot.flowId !== session.flowId || (session.projectId && input.snapshot.projectId !== session.projectId)) {
      throw new AgentApiError(400, "AGENT_CANVAS_FLOW_MISMATCH", "Agent session is not bound to the requested flow.");
    }
    const idempotencyKey = input.idempotencyKey?.trim() || `agent-v2:${sessionId}:${randomUUID()}`;
    const existingTurn = await this.sessionRepository.getV2TurnByIdempotency(context, idempotencyKey);
    if (existingTurn) {
      if (["succeeded", "failed", "cancelled"].includes(existingTurn.status) || existingTurn.cancelledAt) {
        await this.replayV2Turn(context, sessionId, existingTurn.id, writeChunk);
        return;
      }
      throw new AgentApiError(409, "AGENT_TURN_IN_PROGRESS", "This Agent turn is already running.");
    }
    const currentDraft = await this.flowsService.getFlowDraft(context, session.flowId);
    if (input.expectedGraphRevision !== undefined && input.expectedGraphRevision !== currentDraft.revision) {
      throw new AgentApiError(409, "FLOW_DRAFT_REVISION_CONFLICT", "画布已被其他修改，请刷新后重试。");
    }
    const graphRevision = input.expectedGraphRevision ?? currentDraft.revision;
    const userMessage = await this.sessionRepository.appendUserMessage(context, sessionId, { content: input.prompt, metadata: { agentVersion: "v2", selectedSkillId: input.selectedSkillId ?? null, selectedSkillVersion: input.selectedSkillVersion ?? null, idempotencyKey } });
    if (!input.selectedSkillId && input.selectedSkillVersion !== undefined) {
      throw new AgentApiError(400, "SKILL_VERSION_REQUIRES_SKILL", "A Skill version requires a selected Skill.");
    }
    const skill = input.selectedSkillId && this.skillService
      ? input.selectedSkillVersion === undefined
        ? await this.skillService.getPublishedVersion(context, input.selectedSkillId)
        : await this.skillService.getPublishedVersionByNumber(context, input.selectedSkillId, input.selectedSkillVersion)
      : null;
    const turnId = await this.createV2TurnRecord(context, sessionId, userMessage.id, input.snapshot, idempotencyKey, graphRevision);
    const leaseOwner = `agent-v2:${randomUUID()}`;
    const lease = await this.sessionRepository.acquireTurnLease(context, { leaseOwner, turnId });
    if (!lease) throw new AgentApiError(409, "AGENT_TURN_IN_PROGRESS", "This Agent turn is already running.");
    const skillRunId = skill && this.skillRunService
      ? await this.ensureSkillRun(context, session, skill.id, idempotencyKey, graphRevision, turnId)
      : undefined;
    const loop = new V2AgentTurnLoop({
      textRuntime: { streamText: (request) => this.textRuntime.streamText!(context, request) },
      executeTool: async (tool) => {
        await this.sessionRepository.assertTurnActive(context, turnId);
        return this.executeV2Tool(context, sessionId, turnId, input.snapshot, tool, graphRevision, skillRunId, skill?.id, skill ? { id: skill.skillId, version: skill.version, source: skill.source, normalized: skill.normalized } : null);
      },
    });
    const contextAddenda = await this.loadV2ContextAddenda(context, input.snapshot);
    let eventIndex = 0;
    let waitingForResults = false;
    const startedAt = Date.now();
    let firstEventLatencyMs: number | null = null;
    let redactionHits = 0;
    const observability = () => ({
      skillId: skill?.skillId ?? null,
      skillVersion: skill?.version ?? null,
      runDurationMs: Date.now() - startedAt,
      firstEventLatencyMs,
      failedStep: null,
      retryCount: 0,
      redactionHits,
    });
    const renewTimer = setInterval(() => {
      void this.sessionRepository.renewTurnLease(context, { leaseOwner, turnId });
    }, 10_000);
    try {
      for await (const event of loop.run({ canvas: { ...input.snapshot, revision: graphRevision }, prompt: input.prompt, routeKey: input.routeKey, context: buildScopedV2AgentContext({ canvas: input.snapshot, graphRevision, prompt: input.prompt, skill: skill ? { id: skill.id, version: skill.version, source: skill.source, normalized: skill.normalized } : undefined, ...contextAddenda }), skill: skill ? { id: skill.id, version: skill.version, source: skill.source, normalized: skill.normalized } : undefined })) {
        await this.sessionRepository.assertTurnActive(context, turnId);
        waitingForResults = event.type === "turn_waiting";
        eventIndex += 1;
        if (firstEventLatencyMs === null) firstEventLatencyMs = Date.now() - startedAt;
        const safeEvent = sanitizeV2AgentEventForClient(event);
        const rawEventText = JSON.stringify(event);
        const safeEventText = JSON.stringify(safeEvent);
        if (rawEventText.length > safeEventText.length) redactionHits += 1;
        await this.sessionRepository.appendSessionEvent(context, {
          agentNamespace: "canvas",
          agentVersion: "v2",
          eventJson: safeEvent,
          eventType: event.type,
          graphRevision,
          idempotencyKey: `${idempotencyKey}:event:${eventIndex}`,
          sessionId,
          turnId,
        });
        await writeChunk(formatStreamEvent(`agent_v2_${event.type}`, { ...safeEvent, turnId }));
      }
      await this.sessionRepository.appendSessionEvent(context, {
        agentNamespace: "canvas",
        agentVersion: "v2",
        eventJson: observability(),
        eventType: "turn_observability",
        graphRevision,
        idempotencyKey: `${idempotencyKey}:observability`,
        sessionId,
        turnId,
      });
      if (!waitingForResults) await this.finishV2TurnRecord(context, turnId, "succeeded", null);
      await writeChunk(formatStreamEvent("done", { sessionId, turnId, waitingForResults }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cancelled = message === "AGENT_TURN_CANCELLED";
      await this.finishV2TurnRecord(context, turnId, cancelled ? "cancelled" : "failed", cancelled ? null : { code: "AGENT_V2_TURN_FAILED", message });
      if (!cancelled) {
        await this.sessionRepository.appendSessionEvent(context, {
          agentNamespace: "canvas",
          agentVersion: "v2",
          eventJson: { code: "AGENT_V2_TURN_FAILED", graphRevision, message },
          eventType: "turn_failed",
          graphRevision,
          idempotencyKey: `${idempotencyKey}:failed`,
          sessionId,
          turnId,
        });
      }
      await this.sessionRepository.appendSessionEvent(context, {
        agentNamespace: "canvas",
        agentVersion: "v2",
        eventJson: observability(),
        eventType: "turn_observability",
        graphRevision,
        idempotencyKey: `${idempotencyKey}:observability`,
        sessionId,
        turnId,
      });
      throw error;
    } finally {
      clearInterval(renewTimer);
      await this.sessionRepository.releaseTurnLease(context, { leaseOwner, turnId });
    }
  }

  private async loadV2ContextAddenda(context: AgentContext, snapshot: CanvasAgentSnapshotInput): Promise<{ modelCatalog: unknown[]; recentRuns: unknown[] }> {
    let modelCatalog: unknown[] = [];
    if (this.aiModelCatalogService) {
      try {
        const models = await this.aiModelCatalogService.listModels(context, { environment: "production" });
        modelCatalog = await Promise.all(models.slice(0, 12).map(async (model) => {
          try {
            const routes = await this.aiModelCatalogService!.listRoutesForModel(context, model.modelKey, { environment: "production" });
            // Routes returned by the catalog are already active and product-visible;
            // add an explicit status marker for the context projector without
            // forwarding provider, route, or upstream identifiers.
            return { displayName: model.displayName, modality: model.modality, status: model.status, capabilities: model.capabilities, routes: routes.map((route) => ({ status: "active", estimatedCredits: route.estimatedCredits, pricing: route.pricing })) };
          } catch {
            return { displayName: model.displayName, modality: model.modality, status: model.status, capabilities: model.capabilities, routes: [] };
          }
        }));
      } catch {
        modelCatalog = [];
      }
    }
    let recentRuns: unknown[] = [];
    if (snapshot.flowId) {
      try {
        const result = await withTenantTransaction(context, (client) => client.query(`
          SELECT
            run.id::text AS id,
            run.status,
            run.output_json,
            run.created_at,
            COALESCE(array_agg(DISTINCT step.node_id) FILTER (WHERE step.node_id IS NOT NULL), '{}') AS node_ids,
            COALESCE(jsonb_agg(DISTINCT jsonb_build_object('assetId', step.asset_id::text)) FILTER (WHERE step.asset_id IS NOT NULL), '[]'::jsonb) AS asset_refs
          FROM agent_skill_runs AS run
          LEFT JOIN agent_skill_step_runs AS step
            ON step.tenant_id = run.tenant_id AND step.skill_run_id = run.id
          WHERE run.tenant_id = $1::uuid AND run.flow_id = $2::uuid
          GROUP BY run.id, run.status, run.output_json, run.created_at
          ORDER BY run.created_at DESC
          LIMIT 8`, [context.tenantId, snapshot.flowId]), this.pool);
        recentRuns = result.rows.map((row: Record<string, unknown>) => {
          const output = row.output_json && typeof row.output_json === "object" ? row.output_json as Record<string, unknown> : {};
          return {
            id: row.id,
            modality: typeof output.modality === "string" ? output.modality : undefined,
            status: row.status,
            summary: typeof output.summary === "string" ? output.summary : undefined,
            createdAt: row.created_at,
            nodeIds: Array.isArray(row.node_ids) ? row.node_ids : [],
            assetRefs: Array.isArray(row.asset_refs) ? row.asset_refs : [],
          };
        });
      } catch {
        recentRuns = [];
      }
    }
    return { modelCatalog, recentRuns };
  }

  private async replayV2Turn(context: AgentContext, sessionId: string, turnId: string, writeChunk: (chunk: string) => void | Promise<void>) {
    const events = await this.sessionRepository.getSessionEvents(context, sessionId, 0);
    for (const event of events.filter((candidate) => candidate.turnId === turnId)) {
      await writeChunk(formatStreamEvent(`agent_v2_${event.eventType}`, { ...event.eventJson, turnId, seq: event.seq }));
    }
    await writeChunk(formatStreamEvent("done", { replayed: true, sessionId, turnId }));
  }

  private async createV2TurnRecord(context: AgentContext, sessionId: string, userMessageId: string, snapshot: CanvasAgentSnapshotInput, idempotencyKey: string, graphRevision: number): Promise<string> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<{ id: string }>(`
        INSERT INTO agent_turns (tenant_id, session_id, user_message_id, status, snapshot_json, plan_json, error_json, agent_version, graph_revision, idempotency_key, updated_at)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'running', $4::jsonb, '{}'::jsonb, NULL, 'v2', $6, $5, now())
        ON CONFLICT DO NOTHING
        RETURNING id::text AS id`, [context.tenantId, sessionId, userMessageId, JSON.stringify(snapshot), idempotencyKey, graphRevision]);
      if (result.rows[0]) return result.rows[0].id;
      const existing = await client.query<{ id: string }>(`SELECT id::text AS id FROM agent_turns WHERE tenant_id = $1::uuid AND agent_version = 'v2' AND idempotency_key = $2 LIMIT 1`, [context.tenantId, idempotencyKey]);
      if (!existing.rows[0]) throw new Error("AGENT_TURN_IDEMPOTENCY_CONFLICT");
      return existing.rows[0].id;
    }, this.pool);
  }

  private async finishV2TurnRecord(context: AgentContext, turnId: string, status: "succeeded" | "failed" | "cancelled", errorJson: Record<string, string> | null) {
    await withTenantTransaction(context, async (client) => {
      await client.query(`UPDATE agent_turns SET status = CASE WHEN cancelled_at IS NOT NULL THEN 'cancelled' ELSE $3 END, error_json = CASE WHEN cancelled_at IS NOT NULL THEN COALESCE(error_json, $4::jsonb) ELSE $4::jsonb END, updated_at = now() WHERE tenant_id = $1::uuid AND id = $2::uuid AND agent_version = 'v2'`, [context.tenantId, turnId, status, errorJson ? JSON.stringify(errorJson) : null]);
    }, this.pool);
  }

  private async ensureSkillRun(context: AgentContext, session: { id: string; projectId: string | null; flowId: string | null }, skillVersionId: string, idempotencyKey: string, graphRevision: number, turnId?: string): Promise<string> {
    if (!this.skillRunService) throw new Error("SKILL_RUNTIME_NOT_CONFIGURED");
    const created = await this.skillRunService.createRun({
      flowId: session.flowId,
      graphRevision,
      idempotencyKey: `${idempotencyKey}:skill-run`,
      projectId: session.projectId,
      skillVersionId,
      sessionId: session.id,
      tenantId: context.tenantId,
      turnId: turnId ?? null,
    });
    const current = await this.skillRunService.getRun(context, created.id);
    if (current?.status === "draft") await this.skillRunService.transition(context, created.id, "draft", "planned");
    return created.id;
  }

  private async executeV2Tool(context: AgentContext, sessionId: string, turnId: string, snapshot: CanvasAgentSnapshotInput, tool: V2AgentToolExecution, graphRevision: number, skillRunId?: string, skillVersionId?: string, selectedSkill?: { id: string; version: number; source: unknown; normalized: unknown } | null) {
    if (tool.name === "canvas.get_context") {
      const current = snapshot.flowId ? await this.flowsService.getFlowDraft(context, snapshot.flowId) : null;
      return current
        ? { revision: current.revision, nodes: current.graph.nodes, edges: current.graph.edges, viewport: current.graph.viewport }
        : { revision: graphRevision, nodes: snapshot.nodes, edges: snapshot.edges };
    }
    if (tool.name === "skill.load") return selectedSkill ? { status: "loaded", skill: selectedSkill } : { status: "no_skill_selected" };
    if (tool.name === "canvas.apply_ops") {
      const ops = tool.arguments.ops as Array<Record<string, unknown>>;
      const mapped = ops.map((op) => {
        if (op.type === "add_text" || op.type === "add_image" || op.type === "add_video") return { type: "add_node", kind: op.type === "add_text" ? "text" : op.type === "add_image" ? "image" : "video", data: { text: typeof op.text === "string" ? op.text.slice(0, 12000) : "", title: op.type, agentMetadata: { source: "agent_v2" } }, position: op.position && typeof op.position === "object" ? { x: Number((op.position as Record<string, unknown>).x), y: Number((op.position as Record<string, unknown>).y) } : { x: 0, y: 0 } } as const;
        if (op.type === "update_node") return { type: "update_node_data", nodeId: String(op.nodeId), patch: { text: op.text ?? "" } } as const;
        return { type: "connect_nodes", source: String(op.source), target: String(op.target) } as const;
      });
      return this.canvasService.applyOps(context, sessionId, { expectedRevision: Number(tool.arguments.expectedRevision), strictRevision: true, flowId: snapshot.flowId!, ops: mapped, turnId });
    }
    if (tool.name === "canvas.run_nodes") {
      if (!this.workflowRunAdapter) throw new AgentApiError(503, "WORKFLOW_RUNNER_NOT_CONFIGURED", "Workflow runner is not configured.");
      const currentDraft = await this.flowsService.getFlowDraft(context, snapshot.flowId!);
      const expectedRevision = Number(tool.arguments.expectedRevision);
      if (currentDraft.revision !== expectedRevision) throw new AgentApiError(409, "FLOW_DRAFT_REVISION_CONFLICT", "画布已被其他修改，请刷新后重试。");
      const requestedNodeIds = tool.arguments.nodeIds as string[];
      const draftNodeById = new Map(currentDraft.graph.nodes.map((node) => [String(node.id), node]));
      requestedNodeIds.forEach((nodeId) => { if (!draftNodeById.has(nodeId)) throw new AgentApiError(400, "AGENT_CANVAS_NODE_NOT_FOUND", `Node ${nodeId} was not found in the flow draft.`); });
      const skillStepIds: Record<string, string> = {};
      if (skillRunId && this.skillRunService) {
        const nodes = requestedNodeIds.map((nodeId) => draftNodeById.get(nodeId)!);
        const plan = buildSkillLaunchApprovalPlan({
          flowId: snapshot.flowId!,
          graphRevision: expectedRevision,
          nodes: nodes.map((node) => {
            const data = node.data && typeof node.data === "object" ? node.data as Record<string, unknown> : {};
            const kind = typeof data.kind === "string" ? data.kind : typeof node.type === "string" ? node.type : "unknown";
            // Pricing is resolved by the server-side Workflow Run path. Never
            // trust graph JSON to mark a Skill target as free.
            return { id: String(node.id), type: kind, priced: true };
          }),
        });
        if (plan.requiresApproval) {
          await this.skillRunService.replaceBudgetSnapshot(context, skillRunId, { approvalPlan: plan });
        }
        for (const target of plan.targets) {
          const nodeId = target.nodeId;
          const node = draftNodeById.get(nodeId);
          const step = await this.skillRunService.createStep({ action: target.action, approvalState: plan.requiresApproval ? "pending" : "not_required", nodeId, skillRunId, stepIndex: Object.keys(skillStepIds).length, tenantId: context.tenantId });
          skillStepIds[nodeId] = step.id;
          if (plan.requiresApproval) await this.skillRunService.updateStep(context, step.id, { approvalState: "pending", status: "waiting_for_approval" });
        }
        if (plan.requiresApproval) {
          await this.skillRunService.transition(context, skillRunId, "planned", "waiting_for_approval", { approvalState: "pending" });
          return { approvalId: skillRunId, nodeCount: plan.targets.length, status: "waiting_for_approval" };
        }
      }
      if (skillRunId && this.skillRunService) {
        const current = await this.skillRunService.getRun(context, skillRunId);
        if (current?.status === "planned") await this.skillRunService.transition(context, skillRunId, "planned", "running");
      }
      const result = await this.workflowRunAdapter.runNodes(context, {
        flowId: snapshot.flowId!,
        graphRevision: expectedRevision,
        idempotencyKey: `${turnId}:${tool.callId}`,
        nodeIds: requestedNodeIds,
        skillRunId,
        skillStepIds,
        skillVersionId,
      });
      if (skillRunId && this.skillRunService) {
        await Promise.all(result.runs.map((run) => {
          const stepId = skillStepIds[run.nodeId];
          return stepId ? this.skillRunService!.updateStep(context, stepId, { workflowRunId: run.runId, status: "running" }) : Promise.resolve();
        }));
      }
      return result;
    }
    if (tool.name === "canvas.await_results") {
      if (!this.workflowRunAdapter) throw new AgentApiError(503, "WORKFLOW_RUNNER_NOT_CONFIGURED", "Workflow runner is not configured.");
      const runIds = [
        ...(Array.isArray(tool.arguments.runIds) ? tool.arguments.runIds as string[] : []),
        ...(typeof tool.arguments.runId === "string" ? [tool.arguments.runId] : []),
      ];
      if (runIds.length === 0) return { allTerminal: false, runs: [], status: "waiting", nodeIds: tool.arguments.nodeIds };
      return this.workflowRunAdapter.awaitResults(context, runIds);
    }
    if (tool.name === "ask_user") return { status: "waiting_for_input", question: tool.arguments.question };
    return { status: tool.arguments.status, summary: tool.arguments.summary };
  }

  async cancelV2Turn(context: AgentContext, sessionId: string, input: CancelAgentTurnInput) {
    const session = await this.sessionRepository.getSession(context, sessionId);
    this.assertSessionScope(session, input);
    const history = await this.sessionRepository.getSessionHistory(context, sessionId);
    const turn = history.turns.find((item) => item.id === input.turnId);
    if (!turn || turn.sessionId !== sessionId) throw new AgentApiError(404, "AGENT_TURN_NOT_FOUND", "Agent turn not found.");
    const cancellable = turn.status === "running" || turn.status === "planned";
    if (!cancellable) return { cancelled: false, turnId: turn.id };
    const cancelled = await this.sessionRepository.cancelTurn(context, { sessionId, turnId: turn.id, reason: input.reason });
    if (cancelled && this.skillRunService) {
      const runs = await withTenantTransaction(context, async (client) => {
        const result = await client.query<{ id: string }>(`SELECT id::text AS id FROM agent_skill_runs WHERE tenant_id = $1::uuid AND session_id = $2::uuid AND turn_id = $3::uuid AND status NOT IN ('succeeded','partial_success','failed','cancelled')`, [context.tenantId, sessionId, turn.id]);
        return result.rows.map((row) => row.id);
      }, this.pool);
      await Promise.all(runs.map((runId) => this.skillRunService!.cancel(context, runId, input.reason)));
    }
    return { cancelled, turnId: turn.id, response: {
      sessionId,
      turnId: turn.id,
      projectId: session.projectId,
      flowId: session.flowId,
      phase: "failed" as const,
      executionState: "failed" as const,
      graphRevision: turn.graphRevision ?? 0,
      blocks: turn.blocksJson,
      error: input.reason || "已取消",
    } };
  }

  private assertSessionScope(session: { projectId: string | null; flowId: string | null }, scope: AgentSessionScope): void {
    if (scope.projectId !== undefined && scope.projectId !== session.projectId) throw new AgentApiError(409, "AGENT_SESSION_SCOPE_MISMATCH", "Agent session is not bound to the requested project.");
    if (scope.flowId !== undefined && scope.flowId !== session.flowId) throw new AgentApiError(409, "AGENT_SESSION_SCOPE_MISMATCH", "Agent session is not bound to the requested flow.");
  }

  async approveV2SkillRun(context: AgentContext, sessionId: string, runId: string) {
    if (!this.skillRunService) throw new AgentApiError(503, "SKILL_RUNTIME_NOT_CONFIGURED", "Skill runtime is not configured.");
    const run = await this.skillRunService.getRun(context, runId);
    if (!run) throw new AgentApiError(404, "SKILL_RUN_NOT_FOUND", "Skill run not found.");
    if (run.sessionId !== sessionId) throw new AgentApiError(404, "SKILL_RUN_NOT_FOUND", "Skill run not found.");
    const session = await this.sessionRepository.getSession(context, sessionId);
    if (run.flowId !== session.flowId || run.projectId !== session.projectId) throw new AgentApiError(409, "SKILL_RUN_SCOPE_MISMATCH", "Skill run is not bound to this Agent session.");
    const plan = parseSkillLaunchApprovalPlan(run.budgetSnapshot.approvalPlan);
    if (!this.workflowRunAdapter) throw new AgentApiError(503, "WORKFLOW_RUNNER_NOT_CONFIGURED", "Workflow runner is not configured.");
    const draft = await this.flowsService.getFlowDraft(context, plan.flowId);
    if (draft.revision !== plan.graphRevision) throw new AgentApiError(409, "FLOW_DRAFT_REVISION_CONFLICT", "画布已被其他修改，请刷新后重试。");
    const approved = await this.skillRunService.approve(context, runId);
    const existingRuns = approved.steps.filter((step) => step.workflowRunId);
    if (existingRuns.length === plan.targets.length) return { status: "running", approvalId: runId, runs: existingRuns.map((step) => ({ nodeId: step.nodeId, runId: step.workflowRunId })) };
    if (!await this.skillRunService.claimApprovalLaunch(context, runId)) {
      const current = await this.skillRunService.getRun(context, runId);
      return { status: "running", approvalId: runId, runs: current?.steps.filter((step) => step.workflowRunId).map((step) => ({ nodeId: step.nodeId, runId: step.workflowRunId })) ?? [] };
    }
    const skillStepIds = Object.fromEntries(approved.steps.filter((step) => step.nodeId).map((step) => [step.nodeId!, step.id]));
    try {
      const result = await this.workflowRunAdapter!.runNodes(context, {
        flowId: plan.flowId,
        graphRevision: plan.graphRevision,
        idempotencyKey: `skill-approval:${run.id}`,
        nodeIds: plan.targets.map((target) => target.nodeId),
        skillRunId: run.id,
        skillStepIds,
        skillVersionId: run.skillVersionId,
      });
      await Promise.all(result.runs.map((item) => {
        const stepId = skillStepIds[item.nodeId];
        return stepId ? this.skillRunService!.updateStep(context, stepId, { status: "running", approvalState: "approved", workflowRunId: item.runId }) : Promise.resolve();
      }));
      return { ...result, status: "running", approvalId: runId };
    } catch (error) {
      await this.skillRunService.transition(context, runId, "running", "failed", { error: { code: error instanceof Error && error.message === "FLOW_DRAFT_REVISION_CONFLICT" ? "FLOW_DRAFT_REVISION_CONFLICT" : "SKILL_APPROVAL_LAUNCH_FAILED" } });
      throw error;
    }
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

  private assertV5SessionSnapshot(session: AgentSessionRow, input: CreateAgentV5TurnInput): void {
    const { contextSnapshot, snapshot } = input;
    if (input.modelKey !== contextSnapshot.modelKey) {
      throw new AgentApiError(400, "AGENT_V5_MODEL_CONTEXT_MISMATCH", "The selected text model does not match the conversation context.");
    }
    if (
      snapshot.flowId !== contextSnapshot.flowId
      || snapshot.projectId !== contextSnapshot.projectId
      || (session.flow_id !== null && contextSnapshot.flowId !== session.flow_id)
      || (session.project_id !== null && contextSnapshot.projectId !== session.project_id)
    ) {
      throw new AgentApiError(400, "AGENT_CANVAS_FLOW_MISMATCH", "Agent session is not bound to the requested canvas.");
    }
  }

  private v5PlanState(value: unknown): {
    age?: { id: string; label: string };
    direction?: { id: string; label: string };
    goal: string;
    mode?: "auto" | "manual_confirmation";
    modelKey?: string | null;
    referenceCount?: number;
  } {
    const record = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).v5Conversation
      : null;
    const input = record && typeof record === "object" && !Array.isArray(record)
      ? record as Record<string, unknown>
      : {};
    const selected = (field: "age" | "direction") => {
      const value = input[field];
      if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
      const option = value as Record<string, unknown>;
      return typeof option.id === "string" && typeof option.label === "string"
        ? { id: option.id, label: option.label }
        : undefined;
    };
    return {
      ...(selected("age") ? { age: selected("age") } : {}),
      ...(selected("direction") ? { direction: selected("direction") } : {}),
      goal: typeof input.goal === "string" && input.goal.trim() ? input.goal.slice(0, 500) : "儿童陪伴玩具概念设计",
      ...(input.mode === "auto" || input.mode === "manual_confirmation" ? { mode: input.mode } : {}),
      ...(typeof input.modelKey === "string" || input.modelKey === null ? { modelKey: input.modelKey } : {}),
      ...(typeof input.referenceCount === "number" && Number.isSafeInteger(input.referenceCount) ? { referenceCount: input.referenceCount } : {}),
    };
  }

  private v5BriefFieldLabel(value: string): string | null {
    const fields: Record<string, string> = {
      age: "适用年龄",
      direction: "优先方向",
      goal: "产品目标",
      nextStep: "下一步",
      "下一步": "下一步",
      "产品目标": "产品目标",
      "优先方向": "优先方向",
      "适用年龄": "适用年龄",
    };
    return fields[value] ?? null;
  }

  private async assertV5GraphRevision(
    context: AgentContext,
    client: PoolClient,
    session: AgentSessionRow,
    storedRevision: string | null,
  ): Promise<void> {
    if (!session.flow_id) return;
    if (storedRevision === null) {
      throw new AgentApiError(409, "FLOW_DRAFT_REVISION_CONFLICT", "画布版本缺失，请刷新后重试。");
    }
    // Create the draft if needed through the ownership-aware Flow service, then
    // take a row lock in this transaction so a concurrent draft write cannot
    // pass the confirmation check after this point.
    await this.flowsService.getFlowDraft(context, session.flow_id);
    const current = await client.query<{ revision: string }>(
      `SELECT revision::text AS revision FROM flow_drafts WHERE flow_id = $1::uuid FOR SHARE`,
      [session.flow_id],
    );
    if (current.rowCount === 0 || Number(current.rows[0]!.revision) !== Number(storedRevision)) {
      throw new AgentApiError(409, "FLOW_DRAFT_REVISION_CONFLICT", "画布已被其他修改，请刷新后重试。");
    }
  }

  private projectV5Turn(turn: V5TurnRow & { sessionId?: string }) {
    return {
      blocks: v5Blocks(turn.blocks_json),
      executionState: turn.execution_state,
      phase: turn.conversation_phase,
      sessionId: turn.sessionId ?? turn.session_id,
      turnId: turn.id,
    };
  }

  private async requireSession(client: PoolClient, sessionId: string, forUpdate = false) {
    const result = await client.query<AgentSessionRow>(
      `
        SELECT
          id::text AS id,
          project_id::text AS project_id,
          flow_id::text AS flow_id,
          title,
          status,
          execution_mode,
          conversation_phase,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM agent_sessions
        WHERE id = $1::uuid
        LIMIT 1
        ${forUpdate ? "FOR UPDATE" : ""}
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
      conversationPhase: row.conversation_phase ?? "idle",
      createdAt: row.created_at,
      executionMode: row.execution_mode ?? "manual_confirmation",
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
