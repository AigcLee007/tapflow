import { randomUUID } from "node:crypto";

import {
  BillingService,
  BillingServiceError,
  createPgPool,
  safeRecordAuditLog,
  withTenantTransaction,
} from "@aigc-flow/db";
import {
  QUEUE_NAMES,
  assertLightweightJobPayload,
  type NodeExecuteJobPayload,
} from "@aigc-flow/redis";
import {
  checksumGraph,
  compileGraph,
  type CompiledWorkflow,
  type FlowGraph,
  validateGraph,
  WorkflowGraphValidationError,
} from "@aigc-flow/workflow-core";
import type { Pool, PoolClient } from "pg";
import { assertDraftGraphSafe, normalizeDraftGraph } from "../flows/flows.service.js";

type PgPool = Pool;

type WorkflowRunContext = {
  ipHash?: string | null;
  requestId?: string | null;
  tenantId: string;
  traceId?: string | null;
  userAgent?: string | null;
  userId: string | null;
};

type NodeExecuteQueueLike = {
  add: (name: string, data: NodeExecuteJobPayload) => Promise<unknown>;
};

type FlowRuntimeRecord = {
  compiled_graph_json: CompiledWorkflow;
  current_version_id: string | null;
  flow_id: string;
  flow_status: string;
};

type FlowDraftGraph = {
  edges: Record<string, unknown>[];
  nodes: Record<string, unknown>[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
};

type FlowDraftRecord = {
  graph_json: FlowDraftGraph;
};

type FlowVersionRecord = {
  checksum?: string;
  compiled_graph_json?: CompiledWorkflow;
  id: string;
};

type PricingRow = {
  min_charge_credits: string;
  model: string;
  provider: string;
  route: string;
  unit: string;
};

export type PricingMatchInfo = {
  model: string;
  provider: string;
  route: string;
  unit: string;
};

export type ResolvedNodePricing = {
  amountCents: number;
  fallbackLevel: 1 | 2 | 3 | 4 | null;
  pricingMatch: PricingMatchInfo | null;
  unit: string | null;
};

type RouteRuntimeContext = {
  modelKey: string;
  providerKey: string;
  routeKey: string;
};

type WorkflowRunRecord = {
  canceled_at: string | null;
  created_at: string;
  created_by: string | null;
  error_json: Record<string, unknown> | null;
  finished_at: string | null;
  flow_id: string;
  flow_version_id: string;
  id: string;
  idempotency_key: string | null;
  input_json: Record<string, unknown>;
  output_json: Record<string, unknown> | null;
  started_at: string | null;
  status: string;
  tenant_id: string;
  updated_at: string;
};

type NodeRunRecord = {
  attempt: number;
  cost_json: Record<string, unknown>;
  created_at: string;
  error_json: Record<string, unknown> | null;
  finished_at: string | null;
  id: string;
  input_json: Record<string, unknown>;
  max_attempts: number;
  node_id: string;
  node_type: string;
  output_json: Record<string, unknown> | null;
  provider_task_id: string | null;
  started_at: string | null;
  status: string;
  tenant_id: string;
  updated_at: string;
  workflow_run_id: string;
};

type WorkflowRunEventRecord = {
  created_at: string;
  event_type: string;
  id: string;
  node_run_id: string | null;
  payload: Record<string, unknown>;
  sequence: number;
  tenant_id: string;
  workflow_run_id: string;
};

export type WorkflowRunView = {
  canceledAt: string | null;
  createdAt: string;
  createdBy: string | null;
  errorJson: Record<string, unknown> | null;
  finishedAt: string | null;
  flowId: string;
  flowVersionId: string;
  id: string;
  idempotencyKey: string | null;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown> | null;
  startedAt: string | null;
  status: string;
  tenantId: string;
  updatedAt: string;
};

export type WorkflowRunStatusView = Pick<
  WorkflowRunView,
  "canceledAt" | "finishedAt" | "id" | "status" | "tenantId"
>;

export type NodeRunView = {
  attempt: number;
  costJson: Record<string, unknown>;
  createdAt: string;
  errorJson: Record<string, unknown> | null;
  finishedAt: string | null;
  id: string;
  inputJson: Record<string, unknown>;
  maxAttempts: number;
  nodeId: string;
  nodeType: string;
  outputJson: Record<string, unknown> | null;
  providerTaskId: string | null;
  startedAt: string | null;
  status: string;
  tenantId: string;
  updatedAt: string;
  workflowRunId: string;
};

export type WorkflowRunEventView = {
  createdAt: string;
  eventType: string;
  id: string;
  nodeRunId: string | null;
  payload: Record<string, unknown>;
  sequence: number;
  tenantId: string;
  workflowRunId: string;
};

export class WorkflowRunsApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "WorkflowRunsApiError";
    this.statusCode = statusCode;
  }
}

const AUTO_RUN_SNAPSHOT_CHANGELOG = "auto_run_snapshot";
const DEFAULT_ROUTE_BY_NODE_TYPE: Record<string, string> = {
  "image.generate": "image.default",
  "text.generate": "text.default",
  "video.generate": "video.default",
};
const UNIT_BY_NODE_TYPE: Record<string, string> = {
  "image.generate": "image_generation",
  "text.generate": "text_generation",
  "video.generate": "video_generation",
};

export function resolveNodePricing(input: {
  configuredRouteKey: string | null;
  nodeType: string;
  pricingRows: PricingRow[];
  routeContext: RouteRuntimeContext | null;
}): ResolvedNodePricing {
  const unit = UNIT_BY_NODE_TYPE[input.nodeType] ?? null;
  if (!unit) {
    return {
      amountCents: 0,
      fallbackLevel: null,
      pricingMatch: null,
      unit: null,
    };
  }

  const configuredRoute = input.configuredRouteKey?.trim() ?? "";
  const effectiveRoute = configuredRoute || DEFAULT_ROUTE_BY_NODE_TYPE[input.nodeType] || "default";
  const provider = input.routeContext?.providerKey ?? "default";
  const model = input.routeContext?.modelKey ?? "default";
  const rawCandidates: Array<{ fallbackLevel: 1 | 2 | 3 | 4; model: string; provider: string; route: string }> = [
    { fallbackLevel: 1, model, provider, route: effectiveRoute },
    { fallbackLevel: 2, model, provider, route: "default" },
    { fallbackLevel: 3, model: "default", provider, route: "default" },
    { fallbackLevel: 4, model: "default", provider: "default", route: "default" },
  ];
  const dedupedCandidates = new Map<string, { fallbackLevel: 1 | 2 | 3 | 4; model: string; provider: string; route: string }>();
  for (const candidate of rawCandidates) {
    const key = `${candidate.provider}::${candidate.model}::${candidate.route}`;
    const existing = dedupedCandidates.get(key);
    if (!existing || candidate.fallbackLevel > existing.fallbackLevel) {
      dedupedCandidates.set(key, candidate);
    }
  }
  const candidates = Array.from(dedupedCandidates.values())
    .sort((left, right) => left.fallbackLevel - right.fallbackLevel);

  const matched = candidates
    .map((candidate) => ({
      candidate,
      row: input.pricingRows.find((pricing) =>
        pricing.unit === unit &&
        pricing.provider === candidate.provider &&
        pricing.model === candidate.model &&
        pricing.route === candidate.route),
    }))
    .find((entry) => entry.row);

  if (!matched || !matched.row) {
    return {
      amountCents: 0,
      fallbackLevel: null,
      pricingMatch: null,
      unit,
    };
  }

  return {
    amountCents: Number.parseInt(matched.row.min_charge_credits, 10) || 0,
    fallbackLevel: matched.candidate.fallbackLevel,
    pricingMatch: {
      model: matched.row.model,
      provider: matched.row.provider,
      route: matched.row.route,
      unit,
    },
    unit,
  };
}

function normalizeNodeTypeForRuntime(type: string): string {
  if (type === "text") {
    return "text.generate";
  }
  if (type === "image") {
    return "image.generate";
  }
  if (type === "video") {
    return "video.generate";
  }
  return type;
}

function normalizeGraphForRuntime(graph: FlowGraph): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      type: normalizeNodeTypeForRuntime(node.type),
    })),
  };
}

function hasLegacySimplifiedNodeType(compiled: CompiledWorkflow | null | undefined): boolean {
  if (!compiled?.nodes?.length) {
    return false;
  }
  return compiled.nodes.some((node) =>
    node.type === "image" || node.type === "text" || node.type === "video"
  );
}

function mapWorkflowRun(row: WorkflowRunRecord): WorkflowRunView {
  return {
    canceledAt: row.canceled_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    errorJson: row.error_json,
    finishedAt: row.finished_at,
    flowId: row.flow_id,
    flowVersionId: row.flow_version_id,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    inputJson: row.input_json ?? {},
    outputJson: row.output_json,
    startedAt: row.started_at,
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
  };
}

function mapNodeRun(row: NodeRunRecord): NodeRunView {
  return {
    attempt: row.attempt,
    costJson: row.cost_json ?? {},
    createdAt: row.created_at,
    errorJson: row.error_json,
    finishedAt: row.finished_at,
    id: row.id,
    inputJson: row.input_json ?? {},
    maxAttempts: row.max_attempts,
    nodeId: row.node_id,
    nodeType: row.node_type,
    outputJson: row.output_json,
    providerTaskId: row.provider_task_id,
    startedAt: row.started_at,
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
    workflowRunId: row.workflow_run_id,
  };
}

function mapWorkflowRunEvent(row: WorkflowRunEventRecord): WorkflowRunEventView {
  return {
    createdAt: row.created_at,
    eventType: row.event_type,
    id: row.id,
    nodeRunId: row.node_run_id,
    payload: row.payload ?? {},
    sequence: row.sequence,
    tenantId: row.tenant_id,
    workflowRunId: row.workflow_run_id,
  };
}

function isTerminalRunStatus(status: string): boolean {
  return status === "failed" || status === "canceled" || status === "succeeded";
}

export class WorkflowRunsService {
  readonly billingService: BillingService;
  readonly nodeExecuteQueue: NodeExecuteQueueLike;
  readonly pool: PgPool;

  constructor(options: {
    billingService?: BillingService;
    nodeExecuteQueue: NodeExecuteQueueLike;
    pool?: PgPool;
  }) {
    this.nodeExecuteQueue = options.nodeExecuteQueue;
    this.pool = options.pool ?? createPgPool();
    this.billingService = options.billingService ?? new BillingService({ pool: this.pool });
  }

  async createWorkflowRun(
    context: WorkflowRunContext,
    flowId: string,
    input: {
      idempotencyKey?: string;
      input?: Record<string, unknown>;
    },
  ): Promise<{
    runId: string;
    status: string;
  }> {
    const payloadsToEnqueue: NodeExecuteJobPayload[] = [];

    let createdRun: WorkflowRunView;
    try {
      createdRun = await withTenantTransaction(context, async (client) => {
        const runtimeFlow = await this.getCurrentFlowRuntimeOrCreateSnapshot(client, context, flowId);
        const pricingRows = await this.loadActivePricing(client);
        const routeContexts = await this.loadRouteRuntimeContexts(
          client,
          context.tenantId,
          runtimeFlow.compiled_graph_json.nodes,
        );

        if (input.idempotencyKey) {
          const existing = await client.query<WorkflowRunRecord>(
          `
            SELECT
              id::text AS id,
              tenant_id::text AS tenant_id,
              flow_id::text AS flow_id,
              flow_version_id::text AS flow_version_id,
              status,
              input_json,
              output_json,
              error_json,
              idempotency_key,
              created_by::text AS created_by,
              started_at::text AS started_at,
              finished_at::text AS finished_at,
              canceled_at::text AS canceled_at,
              created_at::text AS created_at,
              updated_at::text AS updated_at
            FROM workflow_runs
            WHERE tenant_id = $1::uuid
              AND idempotency_key = $2
            LIMIT 1
          `,
          [context.tenantId, input.idempotencyKey],
        );

          if (existing.rows[0]) {
            return mapWorkflowRun(existing.rows[0]);
          }
        }

        const runId = randomUUID();
        const runInsert = await client.query<WorkflowRunRecord>(
        `
          INSERT INTO workflow_runs (
            id,
            tenant_id,
            flow_id,
            flow_version_id,
            status,
            input_json,
            idempotency_key,
            created_by,
            updated_at
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::uuid,
            'pending',
            $5::jsonb,
            $6,
            $7::uuid,
            now()
          )
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            flow_id::text AS flow_id,
            flow_version_id::text AS flow_version_id,
            status,
            input_json,
            output_json,
            error_json,
            idempotency_key,
            created_by::text AS created_by,
            started_at::text AS started_at,
            finished_at::text AS finished_at,
            canceled_at::text AS canceled_at,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          runId,
          context.tenantId,
          runtimeFlow.flow_id,
          runtimeFlow.current_version_id,
          JSON.stringify(input.input ?? {}),
          input.idempotencyKey ?? null,
          context.userId,
        ],
      );

        const run = mapWorkflowRun(runInsert.rows[0]);

        await this.appendWorkflowRunEvent(client, {
          eventType: "workflow.run.created",
          payload: {
            flowId: runtimeFlow.flow_id,
            flowVersionId: runtimeFlow.current_version_id,
            status: run.status,
          },
          tenantId: context.tenantId,
          workflowRunId: run.id,
        });

        for (const node of runtimeFlow.compiled_graph_json.nodes) {
          const isEntryNode = runtimeFlow.compiled_graph_json.entryNodeIds.includes(node.id);
          const nodeRunId = randomUUID();
          const estimatedCost = this.estimateNodeReserveCents(node, routeContexts, pricingRows);
          if (estimatedCost.unit && estimatedCost.amountCents <= 0) {
            throw new WorkflowRunsApiError(
              422,
              "PRICING_NOT_FOUND",
              `No active pricing found for node ${node.id} (${node.type})`,
            );
          }

          await client.query(
          `
            INSERT INTO node_runs (
              id,
              tenant_id,
              workflow_run_id,
              node_id,
              node_type,
              status,
              input_json,
              cost_json,
              updated_at
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4,
              $5,
              $6,
              $7::jsonb,
              $8::jsonb,
              now()
            )
          `,
          [
            nodeRunId,
            context.tenantId,
            run.id,
            node.id,
            node.type,
            isEntryNode ? "runnable" : "pending",
            JSON.stringify(node.config ?? {}),
            JSON.stringify({
              estimatedCredits: estimatedCost.amountCents,
              estimatedCents: estimatedCost.amountCents,
              pricingFallbackLevel: estimatedCost.fallbackLevel,
              pricingMatch: estimatedCost.pricingMatch,
              pricingUnit: estimatedCost.unit,
              reservedCredits: 0,
              reservedCents: 0,
              reserveLedgerId: null,
              reserveStatus: estimatedCost.amountCents > 0 ? "pending" : "not_required",
            }),
          ],
        );

          if (estimatedCost.amountCents > 0) {
            const reserve = await this.billingService.reserveUsageWithClient(client, context.tenantId, {
              amountCents: estimatedCost.amountCents,
              description: `${node.type} reserved`,
              idempotencyKey: `reserve:${context.tenantId}:${run.id}:${nodeRunId}`,
              metadata: {
                flowId: runtimeFlow.flow_id,
                flowVersionId: runtimeFlow.current_version_id,
                nodeId: node.id,
                nodeRunId,
                nodeType: node.type,
                pricingFallbackLevel: estimatedCost.fallbackLevel,
                pricingMatch: estimatedCost.pricingMatch,
                pricingUnit: estimatedCost.unit,
                workflowRunId: run.id,
              },
            });

            await client.query(
            `
              UPDATE node_runs
              SET cost_json = cost_json || $2::jsonb
              WHERE id = $1::uuid
            `,
            [
              nodeRunId,
              JSON.stringify({
                reservedCredits: estimatedCost.amountCents,
                reservedCents: estimatedCost.amountCents,
                reserveLedgerId: reserve.id,
                reserveStatus: "reserved",
              }),
            ],
          );
          }

          if (isEntryNode) {
            await this.appendWorkflowRunEvent(client, {
              eventType: "node.run.runnable",
              nodeRunId,
              payload: {
                nodeId: node.id,
                nodeType: node.type,
                status: "runnable",
              },
              tenantId: context.tenantId,
              workflowRunId: run.id,
            });

            const queuePayload: NodeExecuteJobPayload = {
              nodeRunId,
              tenantId: context.tenantId,
              traceId: context.traceId ?? undefined,
              workflowRunId: run.id,
            };
            assertLightweightJobPayload(queuePayload);
            payloadsToEnqueue.push(queuePayload);
          }
        }

        return run;
      }, this.pool);
    } catch (error) {
      if (error instanceof BillingServiceError) {
        throw new WorkflowRunsApiError(error.statusCode, error.code, error.message);
      }
      throw error;
    }

    for (const payload of payloadsToEnqueue) {
      await this.nodeExecuteQueue.add(QUEUE_NAMES.nodeExecute, payload);
    }

    await safeRecordAuditLog(
      {
        action: "workflow.run.create",
        actorType: context.userId ? "user" : "system",
        actorUserId: context.userId,
        ipHash: context.ipHash,
        metadata: {
          flowId,
          idempotencyKey: input.idempotencyKey ?? null,
          status: createdRun.status,
        },
        requestId: context.requestId,
        resourceId: createdRun.id,
        resourceType: "workflow_run",
        tenantId: context.tenantId,
        traceId: context.traceId,
        userAgent: context.userAgent,
      },
      {
        pool: this.pool,
      },
    );

    return {
      runId: createdRun.id,
      status: createdRun.status,
    };
  }

  async getWorkflowRun(
    context: WorkflowRunContext,
    runId: string,
  ): Promise<{
    nodeRuns: NodeRunView[];
    workflowRun: WorkflowRunView;
  }> {
    return withTenantTransaction(context, async (client) => {
      const workflowRun = await this.getWorkflowRunOrThrow(client, runId);
      const nodeRuns = await client.query<NodeRunRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            workflow_run_id::text AS workflow_run_id,
            node_id,
            node_type,
            status,
            attempt,
            max_attempts,
            input_json,
            output_json,
            error_json,
            provider_task_id,
            cost_json,
            started_at::text AS started_at,
            finished_at::text AS finished_at,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM node_runs
          WHERE workflow_run_id = $1::uuid
          ORDER BY created_at ASC, id ASC
        `,
        [runId],
      );

      return {
        nodeRuns: nodeRuns.rows.map(mapNodeRun),
        workflowRun,
      };
    }, this.pool);
  }

  async listWorkflowRunEvents(
    context: WorkflowRunContext,
    runId: string,
    options?: {
      afterSequence?: number;
    },
  ): Promise<WorkflowRunEventView[]> {
    return withTenantTransaction(context, async (client) => {
      await this.getWorkflowRunOrThrow(client, runId);

      const result = await client.query<WorkflowRunEventRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            workflow_run_id::text AS workflow_run_id,
            node_run_id::text AS node_run_id,
            event_type,
            sequence,
            payload,
            created_at::text AS created_at
          FROM workflow_run_events
          WHERE workflow_run_id = $1::uuid
            AND sequence > $2::int
          ORDER BY sequence ASC, id ASC
        `,
        [runId, options?.afterSequence ?? 0],
      );

      return result.rows.map(mapWorkflowRunEvent);
    }, this.pool);
  }

  async cancelWorkflowRun(
    context: WorkflowRunContext,
    runId: string,
  ): Promise<WorkflowRunView> {
    const result = await withTenantTransaction(context, async (client) => {
      const current = await this.getWorkflowRunOrThrow(client, runId, true);
      if (isTerminalRunStatus(current.status)) {
        return {
          didCancel: false,
          workflowRun: current,
        };
      }

      await this.refundOpenReservations(client, runId, context.tenantId);

      const updated = await client.query<WorkflowRunRecord>(
        `
          UPDATE workflow_runs
          SET
            status = 'canceled',
            canceled_at = now(),
            finished_at = COALESCE(finished_at, now()),
            updated_at = now()
          WHERE id = $1::uuid
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            flow_id::text AS flow_id,
            flow_version_id::text AS flow_version_id,
            status,
            input_json,
            output_json,
            error_json,
            idempotency_key,
            created_by::text AS created_by,
            started_at::text AS started_at,
            finished_at::text AS finished_at,
            canceled_at::text AS canceled_at,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [runId],
      );

      await this.appendWorkflowRunEvent(client, {
        eventType: "workflow.run.canceled",
        payload: {
          status: "canceled",
        },
        tenantId: context.tenantId,
        workflowRunId: runId,
      });

      return {
        didCancel: true,
        workflowRun: mapWorkflowRun(updated.rows[0]),
      };
    }, this.pool);

    if (result.didCancel) {
      await safeRecordAuditLog(
        {
          action: "workflow.run.cancel",
          actorType: context.userId ? "user" : "system",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            status: result.workflowRun.status,
          },
          requestId: context.requestId,
          resourceId: result.workflowRun.id,
          resourceType: "workflow_run",
          tenantId: context.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        {
          pool: this.pool,
        },
      );
    }

    return result.workflowRun;
  }

  async getWorkflowRunStatus(
    context: WorkflowRunContext,
    runId: string,
  ): Promise<WorkflowRunStatusView> {
    return withTenantTransaction(context, async (client) => {
      const workflowRun = await this.getWorkflowRunOrThrow(client, runId);
      return {
        canceledAt: workflowRun.canceledAt,
        finishedAt: workflowRun.finishedAt,
        id: workflowRun.id,
        status: workflowRun.status,
        tenantId: workflowRun.tenantId,
      };
    }, this.pool);
  }

  isTerminalWorkflowRunStatus(status: string): boolean {
    return isTerminalRunStatus(status);
  }

  private async appendWorkflowRunEvent(
    client: PoolClient,
    input: {
      eventType: string;
      nodeRunId?: string;
      payload: Record<string, unknown>;
      tenantId: string;
      workflowRunId: string;
    },
  ): Promise<void> {
    const sequenceResult = await client.query<{ next_sequence: number }>(
      `
        SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
        FROM workflow_run_events
        WHERE workflow_run_id = $1::uuid
      `,
      [input.workflowRunId],
    );

    await client.query(
      `
        INSERT INTO workflow_run_events (
          tenant_id,
          workflow_run_id,
          node_run_id,
          event_type,
          sequence,
          payload
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4,
          $5::int,
          $6::jsonb
        )
      `,
      [
        input.tenantId,
        input.workflowRunId,
        input.nodeRunId ?? null,
        input.eventType,
        sequenceResult.rows[0]?.next_sequence ?? 1,
        JSON.stringify(input.payload),
      ],
    );
  }

  private async loadActivePricing(client: PoolClient): Promise<PricingRow[]> {
    const result = await client.query<PricingRow>(
      `
        SELECT
          provider,
          model,
          route,
          unit,
          min_charge_credits::text AS min_charge_credits
        FROM model_pricing
        WHERE active = true
      `,
    );
    return result.rows;
  }

  private async loadRouteRuntimeContexts(
    client: PoolClient,
    tenantId: string,
    nodes: CompiledWorkflow["nodes"],
  ): Promise<Map<string, RouteRuntimeContext>> {
    const routeKeys = Array.from(new Set(nodes
      .map((node) => {
        if (typeof node.config?.routeKey === "string" && node.config.routeKey.trim().length > 0) {
          return node.config.routeKey.trim();
        }
        const defaultRoute = DEFAULT_ROUTE_BY_NODE_TYPE[node.type];
        return defaultRoute ?? "";
      })
      .filter((routeKey) => routeKey.length > 0)));

    if (routeKeys.length === 0) {
      return new Map();
    }

    const result = await client.query<{
      model_key: string;
      provider_key: string;
      route_key: string;
      tenant_id: string | null;
    }>(
      `
        SELECT DISTINCT ON (route.route_key)
          route.route_key,
          provider.key AS provider_key,
          model.model_key,
          route.tenant_id::text AS tenant_id
        FROM ai_routes AS route
        JOIN ai_providers AS provider
          ON provider.id = route.provider_id
        LEFT JOIN ai_models AS model
          ON model.id = route.model_id
        WHERE route.status = 'active'
          AND route.route_key = ANY($1::text[])
          AND (route.tenant_id = $2::uuid OR route.tenant_id IS NULL)
        ORDER BY
          route.route_key ASC,
          CASE WHEN route.tenant_id = $2::uuid THEN 0 ELSE 1 END ASC,
          route.updated_at DESC
      `,
      [routeKeys, tenantId],
    );

    const contexts = new Map<string, RouteRuntimeContext>();
    for (const row of result.rows) {
      contexts.set(row.route_key, {
        modelKey: row.model_key || "default",
        providerKey: row.provider_key || "default",
        routeKey: row.route_key,
      });
    }

    return contexts;
  }

  private estimateNodeReserveCents(
    node: CompiledWorkflow["nodes"][number],
    routeContexts: Map<string, RouteRuntimeContext>,
    pricingRows: PricingRow[],
  ): ResolvedNodePricing {
    const configuredRoute = typeof node.config?.routeKey === "string"
      ? node.config.routeKey
      : null;
    const effectiveRoute = configuredRoute?.trim() || DEFAULT_ROUTE_BY_NODE_TYPE[node.type] || "default";
    const routeContext = routeContexts.get(effectiveRoute) ?? null;
    return resolveNodePricing({
      configuredRouteKey: configuredRoute,
      nodeType: node.type,
      pricingRows,
      routeContext,
    });
  }

  private async getCurrentFlowRuntimeOrThrow(
    client: PoolClient,
    flowId: string,
  ): Promise<FlowRuntimeRecord> {
    const result = await client.query<FlowRuntimeRecord>(
      `
        SELECT
          flows.id::text AS flow_id,
          flows.status AS flow_status,
          flows.current_version_id::text AS current_version_id,
          flow_versions.compiled_graph_json
        FROM flows
        LEFT JOIN flow_versions
          ON flow_versions.id = flows.current_version_id
        WHERE flows.id = $1::uuid
          AND flows.deleted_at IS NULL
        LIMIT 1
      `,
      [flowId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new WorkflowRunsApiError(404, "FLOW_NOT_FOUND", "Flow not found");
    }

    return row;
  }

  private async getCurrentFlowRuntimeOrCreateSnapshot(
    client: PoolClient,
    context: WorkflowRunContext,
    flowId: string,
  ): Promise<FlowRuntimeRecord> {
    const flowRow = await client.query<{
      current_version_id: string | null;
      id: string;
      status: string;
    }>(
      `
        SELECT
          id::text AS id,
          status,
          current_version_id::text AS current_version_id
        FROM flows
        WHERE id = $1::uuid
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [flowId],
    );

    const flow = flowRow.rows[0];
    if (!flow) {
      throw new WorkflowRunsApiError(404, "FLOW_NOT_FOUND", "Flow not found");
    }

    await this.createRunSnapshotFromDraft(client, context, flow.id, flow.current_version_id);

    const runtimeFlow = await this.getCurrentFlowRuntimeOrThrow(client, flowId);
    if (!runtimeFlow.current_version_id) {
      throw new WorkflowRunsApiError(400, "FLOW_NOT_PUBLISHED", "Flow does not have a runnable version");
    }
    return runtimeFlow;
  }

  private async createRunSnapshotFromDraft(
    client: PoolClient,
    context: WorkflowRunContext,
    flowId: string,
    currentVersionId: string | null,
  ): Promise<void> {
    const draftResult = await client.query<FlowDraftRecord>(
      `
        SELECT graph_json
        FROM flow_drafts
        WHERE flow_id = $1::uuid
        LIMIT 1
      `,
      [flowId],
    );

    const draft = draftResult.rows[0];
    if (!draft) {
      throw new WorkflowRunsApiError(400, "FLOW_DRAFT_MISSING", "Flow draft is missing");
    }

    const normalizedDraft = normalizeDraftGraph(draft.graph_json);
    assertDraftGraphSafe(normalizedDraft);
    const rawGraph = {
      edges: normalizedDraft.edges,
      nodes: normalizedDraft.nodes,
      viewport: normalizedDraft.viewport,
    } as unknown as FlowGraph;
    const graph = normalizeGraphForRuntime(rawGraph);

    let compiledGraph: CompiledWorkflow;
    let checksum: string;
    try {
      validateGraph(graph);
      compiledGraph = compileGraph(graph);
      checksum = checksumGraph(graph);
    } catch (error) {
      if (error instanceof WorkflowGraphValidationError) {
        throw new WorkflowRunsApiError(400, "INVALID_GRAPH", error.message);
      }
      throw error;
    }

    if (currentVersionId) {
      const currentVersion = await client.query<FlowVersionRecord>(
        `
          SELECT
            id::text AS id,
            checksum,
            compiled_graph_json
          FROM flow_versions
          WHERE id = $1::uuid
          LIMIT 1
        `,
        [currentVersionId],
      );
      const current = currentVersion.rows[0];
      if (
        current?.id &&
        current.checksum === checksum &&
        !hasLegacySimplifiedNodeType(current.compiled_graph_json)
      ) {
        return;
      }
    }

    const existingVersion = await client.query<FlowVersionRecord>(
      `
        SELECT
          id::text AS id,
          compiled_graph_json
        FROM flow_versions
        WHERE flow_id = $1::uuid
          AND checksum = $2
        LIMIT 1
      `,
      [flowId, checksum],
    );
    const reusableVersion = existingVersion.rows[0] && !hasLegacySimplifiedNodeType(existingVersion.rows[0].compiled_graph_json)
      ? existingVersion.rows[0]
      : null;
    const versionId = reusableVersion?.id ?? randomUUID();
    if (!reusableVersion) {
      const nextVersionResult = await client.query<{ next_version: number }>(
        `
          SELECT COALESCE(MAX(version), 0) + 1 AS next_version
          FROM flow_versions
          WHERE flow_id = $1::uuid
        `,
        [flowId],
      );
      const nextVersion = Number(nextVersionResult.rows[0]?.next_version ?? 1);

      await client.query(
        `
          INSERT INTO flow_versions (
            id,
            tenant_id,
            flow_id,
            version,
            graph_json,
            compiled_graph_json,
            checksum,
            changelog,
            published_by,
            published_at
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::int,
            $5::jsonb,
            $6::jsonb,
            $7,
            $8,
            $9::uuid,
            now()
          )
        `,
        [
          versionId,
          context.tenantId,
          flowId,
          nextVersion,
          JSON.stringify(graph),
          JSON.stringify(compiledGraph),
          checksum,
          AUTO_RUN_SNAPSHOT_CHANGELOG,
          context.userId,
        ],
      );
    }

    await client.query(
      `
        UPDATE flows
        SET
          current_version_id = $2::uuid,
          status = 'published',
          updated_by = $3::uuid,
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [flowId, versionId, context.userId],
    );
  }

  private async refundOpenReservations(
    client: PoolClient,
    workflowRunId: string,
    tenantId: string,
  ): Promise<void> {
    const result = await client.query<{
      cost_json: Record<string, unknown>;
      id: string;
      node_id: string;
    }>(
      `
        SELECT id::text AS id, node_id, cost_json
        FROM node_runs
        WHERE workflow_run_id = $1::uuid
          AND COALESCE(cost_json->>'reserveStatus', '') = 'reserved'
      `,
      [workflowRunId],
    );

    for (const row of result.rows) {
      const reservedCents = typeof row.cost_json?.reservedCents === "number"
        ? row.cost_json.reservedCents
        : 0;
      if (reservedCents <= 0) {
        continue;
      }

      const ledgerEntry = await this.billingService.refundUsageWithClient(client, tenantId, {
        amountCents: reservedCents,
        description: "Workflow node reservation released after cancellation",
        idempotencyKey: `refund:${tenantId}:${workflowRunId}:${row.id}`,
        metadata: {
          nodeId: row.node_id,
          nodeRunId: row.id,
          workflowRunId,
        },
      });

      await client.query(
        `
          UPDATE node_runs
          SET cost_json = cost_json || $2::jsonb
          WHERE id = $1::uuid
        `,
        [
          row.id,
          JSON.stringify({
            refundLedgerId: ledgerEntry.id,
            reserveStatus: "refunded",
          }),
        ],
      );
    }
  }

  private async getWorkflowRunOrThrow(
    client: PoolClient,
    runId: string,
    forUpdate = false,
  ): Promise<WorkflowRunView> {
    const result = await client.query<WorkflowRunRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          flow_id::text AS flow_id,
          flow_version_id::text AS flow_version_id,
          status,
          input_json,
          output_json,
          error_json,
          idempotency_key,
          created_by::text AS created_by,
          started_at::text AS started_at,
          finished_at::text AS finished_at,
          canceled_at::text AS canceled_at,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM workflow_runs
        WHERE id = $1::uuid
        ${forUpdate ? "FOR UPDATE" : ""}
      `,
      [runId],
    );

    if (!result.rows[0]) {
      throw new WorkflowRunsApiError(404, "WORKFLOW_RUN_NOT_FOUND", "Workflow run not found");
    }

    return mapWorkflowRun(result.rows[0]);
  }
}
