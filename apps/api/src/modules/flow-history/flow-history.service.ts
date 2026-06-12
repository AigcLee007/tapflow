import { randomUUID } from 'node:crypto';

import { checksumGraph, compileGraph, validateGraph, WorkflowGraphValidationError, type CompiledWorkflow, type FlowGraph } from '@aigc-flow/workflow-core';
import { createPgPool, withTenantTransaction } from '@aigc-flow/db';
import type { Pool, PoolClient } from 'pg';

import { assertDraftGraphSafe, normalizeDraftGraph, type FlowDraftView } from '../flows/flows.service.js';
import type { CreateFlowHistorySnapshotInput } from './flow-history.schemas.js';

type PgPool = Pool;

type FlowHistoryContext = {
  tenantId: string;
  userId: string | null;
};

type FlowRecord = {
  current_version_id: string | null;
  id: string;
  project_id: string;
  status: string;
  tenant_id: string;
  title: string;
};

type FlowDraftGraph = FlowDraftView['graph'];

type FlowDraftRecord = {
  created_at: string;
  flow_id: string;
  graph_json: FlowDraftGraph;
  id: string;
  last_saved_by: string | null;
  project_id: string;
  revision: number;
  tenant_id: string;
  updated_at: string;
};

type FlowVersionRecord = {
  changelog: string | null;
  checksum: string;
  compiled_graph_json: CompiledWorkflow;
  created_at: string;
  flow_id: string;
  graph_json: FlowGraph;
  id: string;
  published_at: string | null;
  published_by: string | null;
  tenant_id: string;
  version: number;
};

type FlowActivityEventRecord = {
  actor_user_id: string | null;
  created_at: string;
  event_type: 'restore' | 'snapshot';
  flow_id: string;
  flow_version_id: string | null;
  id: string;
  label: string;
  payload_json: Record<string, unknown> | null;
  project_id: string;
  summary: string;
  tenant_id: string;
};

export type FlowHistoryItemView = {
  actorUserId: string | null;
  createdAt: string;
  eventId: string;
  eventType: 'restore' | 'snapshot';
  flowId: string;
  label: string;
  payload: Record<string, unknown> | null;
  projectId: string;
  summary: string;
  tenantId: string;
  type: 'restore' | 'snapshot';
  version: number | null;
  versionId: string | null;
};

export type FlowHistorySnapshotView = {
  createdAt: string;
  flowId: string;
  label: string;
  projectId: string;
  version: number;
  versionId: string;
};

export class FlowHistoryApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'FlowHistoryApiError';
    this.statusCode = statusCode;
  }
}

function normalizeNodeTypeForRuntime(type: string) {
  if (type === 'text') return 'text.generate';
  if (type === 'image') return 'image.generate';
  if (type === 'video') return 'video.generate';
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

function mapDraft(row: FlowDraftRecord): FlowDraftView {
  return {
    createdAt: row.created_at,
    flowId: row.flow_id,
    graph: normalizeDraftGraph(row.graph_json),
    id: row.id,
    lastSavedBy: row.last_saved_by,
    projectId: row.project_id,
    revision: row.revision,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
  };
}

function mapHistoryItem(
  event: FlowActivityEventRecord,
  version?: { id: string; version: number } | null,
): FlowHistoryItemView {
  return {
    actorUserId: event.actor_user_id,
    createdAt: event.created_at,
    eventId: event.id,
    eventType: event.event_type,
    flowId: event.flow_id,
    label: event.label,
    payload: event.payload_json,
    projectId: event.project_id,
    summary: event.summary,
    tenantId: event.tenant_id,
    type: event.event_type,
    version: version?.version ?? null,
    versionId: version?.id ?? event.flow_version_id,
  };
}

function mapVersionSnapshot(version: FlowVersionRecord): FlowHistorySnapshotView {
  return {
    createdAt: version.created_at,
    flowId: version.flow_id,
    label: version.changelog?.trim() || `Snapshot v${version.version}`,
    projectId: '',
    version: version.version,
    versionId: version.id,
  };
}

export class FlowHistoryService {
  readonly pool: PgPool;

  constructor(options?: { pool?: PgPool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async listHistory(context: FlowHistoryContext, projectId: string): Promise<{ items: FlowHistoryItemView[] }> {
    return withTenantTransaction(context, async (client) => {
      const flow = await this.getPrimaryProjectFlowOrThrow(client, context.tenantId, projectId);

      const result = await client.query<
        FlowActivityEventRecord & { flow_version_id_text: string | null; flow_version_number: number | null }
      >(
        `
          SELECT
            events.id::text AS id,
            events.tenant_id::text AS tenant_id,
            events.project_id::text AS project_id,
            events.flow_id::text AS flow_id,
            events.flow_version_id::text AS flow_version_id,
            events.actor_user_id::text AS actor_user_id,
            events.event_type,
            events.label,
            events.summary,
            events.payload_json,
            events.created_at::text AS created_at,
            versions.id::text AS flow_version_id_text,
            versions.version AS flow_version_number
          FROM flow_activity_events events
          LEFT JOIN flow_versions versions
            ON versions.id = events.flow_version_id
          WHERE events.tenant_id = $1::uuid
            AND events.project_id = $2::uuid
            AND events.flow_id = $3::uuid
          ORDER BY events.created_at DESC, events.id DESC
        `,
        [context.tenantId, projectId, flow.id],
      );

      return {
        items: result.rows.map((row) =>
          mapHistoryItem(row, row.flow_version_id_text ? { id: row.flow_version_id_text, version: row.flow_version_number ?? 0 } : null),
        ),
      };
    }, this.pool);
  }

  async createSnapshot(
    context: FlowHistoryContext,
    projectId: string,
    input: CreateFlowHistorySnapshotInput,
  ): Promise<FlowHistorySnapshotView> {
    return withTenantTransaction(context, async (client) => {
      const flow = await this.getPrimaryProjectFlowOrThrow(client, context.tenantId, projectId);
      const draft = await this.getOrCreateFlowDraft(client, context, flow);
      const graph = this.normalizeRuntimeGraphFromDraft(draft.graph);
      const checksum = checksumGraph(graph);
      const compiledGraph = this.compileGraphForHistory(graph);

      const existing = await client.query<FlowVersionRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            flow_id::text AS flow_id,
            version,
            graph_json,
            compiled_graph_json,
            checksum,
            changelog,
            published_by::text AS published_by,
            published_at::text AS published_at,
            created_at::text AS created_at
          FROM flow_versions
          WHERE tenant_id = $1::uuid
            AND flow_id = $2::uuid
            AND checksum = $3
          ORDER BY version DESC
          LIMIT 1
        `,
        [context.tenantId, flow.id, checksum],
      );

      const label = input.label?.trim() || `Snapshot ${new Date().toLocaleString('zh-CN', { hour12: false })}`;
      const version = existing.rows[0] ?? await this.insertFlowVersion(client, context, flow.id, graph, compiledGraph, checksum, label);

      await this.recordActivityEvent(client, {
        actorUserId: context.userId,
        eventType: 'snapshot',
        flowId: flow.id,
        flowVersionId: version.id,
        label,
        payload: {
          draftRevision: draft.revision,
          version: version.version,
        },
        projectId,
        summary: `保存快照 v${version.version}`,
        tenantId: context.tenantId,
      });

      return {
        createdAt: version.created_at,
        flowId: flow.id,
        label,
        projectId,
        version: version.version,
        versionId: version.id,
      };
    }, this.pool);
  }

  async restoreVersion(
    context: FlowHistoryContext,
    projectId: string,
    versionId: string,
  ): Promise<FlowDraftView> {
    return withTenantTransaction(context, async (client) => {
      const flow = await this.getPrimaryProjectFlowOrThrow(client, context.tenantId, projectId);
      const version = await this.getFlowVersionOrThrow(client, context.tenantId, flow.id, versionId);
      const draft = await this.getOrCreateFlowDraft(client, context, flow);
      const restoredGraph = normalizeDraftGraph(version.graph_json);
      assertDraftGraphSafe(restoredGraph);

      const updated = await client.query<FlowDraftRecord>(
        `
          UPDATE flow_drafts
          SET
            graph_json = $2::jsonb,
            revision = revision + 1,
            last_saved_by = $3::uuid,
            updated_at = now()
          WHERE id = $1::uuid
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            project_id::text AS project_id,
            flow_id::text AS flow_id,
            graph_json,
            revision,
            last_saved_by::text AS last_saved_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [draft.id, JSON.stringify(restoredGraph), context.userId],
      );

      await this.recordActivityEvent(client, {
        actorUserId: context.userId,
        eventType: 'restore',
        flowId: flow.id,
        flowVersionId: version.id,
        label: version.changelog?.trim() || `Snapshot v${version.version}`,
        payload: {
          draftRevision: updated.rows[0]?.revision ?? draft.revision + 1,
          version: version.version,
        },
        projectId,
        summary: `恢复历史版本 v${version.version}`,
        tenantId: context.tenantId,
      });

      return mapDraft(updated.rows[0]);
    }, this.pool);
  }

  private normalizeRuntimeGraphFromDraft(graph: FlowDraftGraph): FlowGraph {
    const normalizedDraft = normalizeDraftGraph(graph);
    assertDraftGraphSafe(normalizedDraft);
    return normalizeGraphForRuntime({
      edges: normalizedDraft.edges as FlowGraph['edges'],
      nodes: normalizedDraft.nodes as FlowGraph['nodes'],
      viewport: normalizedDraft.viewport,
    });
  }

  private compileGraphForHistory(graph: FlowGraph): CompiledWorkflow {
    try {
      validateGraph(graph);
      return compileGraph(graph);
    } catch (error) {
      if (error instanceof WorkflowGraphValidationError) {
        throw new FlowHistoryApiError(400, 'INVALID_GRAPH', error.message);
      }
      throw error;
    }
  }

  private async insertFlowVersion(
    client: PoolClient,
    context: FlowHistoryContext,
    flowId: string,
    graph: FlowGraph,
    compiledGraph: CompiledWorkflow,
    checksum: string,
    label: string,
  ): Promise<FlowVersionRecord> {
    const result = await client.query<FlowVersionRecord>(
      `
        WITH next_version AS (
          SELECT COALESCE(MAX(version), 0) + 1 AS version
          FROM flow_versions
          WHERE flow_id = $2::uuid
        )
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
        SELECT
          $1::uuid,
          $3::uuid,
          $2::uuid,
          next_version.version::int,
          $4::jsonb,
          $5::jsonb,
          $6,
          $7,
          $8::uuid,
          NULL
        FROM next_version
        RETURNING
          id::text AS id,
          tenant_id::text AS tenant_id,
          flow_id::text AS flow_id,
          version,
          graph_json,
          compiled_graph_json,
          checksum,
          changelog,
          published_by::text AS published_by,
          published_at::text AS published_at,
          created_at::text AS created_at
      `,
      [
        randomUUID(),
        flowId,
        context.tenantId,
        JSON.stringify(graph),
        JSON.stringify(compiledGraph),
        checksum,
        label,
        context.userId,
      ],
    );

    return result.rows[0];
  }

  private async recordActivityEvent(
    client: PoolClient,
    input: {
      actorUserId: string | null;
      eventType: 'restore' | 'snapshot';
      flowId: string;
      flowVersionId: string | null;
      label: string;
      payload: Record<string, unknown>;
      projectId: string;
      summary: string;
      tenantId: string;
    },
  ) {
    await client.query(
      `
        INSERT INTO flow_activity_events (
          tenant_id,
          project_id,
          flow_id,
          flow_version_id,
          actor_user_id,
          event_type,
          label,
          summary,
          payload_json
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9::jsonb)
      `,
      [
        input.tenantId,
        input.projectId,
        input.flowId,
        input.flowVersionId,
        input.actorUserId,
        input.eventType,
        input.label,
        input.summary,
        JSON.stringify(input.payload),
      ],
    );
  }

  private async getPrimaryProjectFlowOrThrow(client: PoolClient, tenantId: string, projectId: string): Promise<FlowRecord> {
    const project = await client.query<FlowRecord>(
      `
        SELECT
          flows.id::text AS id,
          flows.tenant_id::text AS tenant_id,
          flows.project_id::text AS project_id,
          flows.title,
          flows.status,
          flows.current_version_id::text AS current_version_id
        FROM flows
        JOIN projects
          ON projects.id = flows.project_id
        WHERE flows.project_id = $1::uuid
          AND flows.tenant_id = $2::uuid
          AND flows.deleted_at IS NULL
          AND projects.deleted_at IS NULL
        ORDER BY flows.created_at ASC, flows.id ASC
        LIMIT 1
      `,
      [projectId, tenantId],
    );

    const row = project.rows[0];
    if (!row) {
      throw new FlowHistoryApiError(404, 'PROJECT_FLOW_NOT_FOUND', '未找到当前项目的画布');
    }

    return row;
  }

  private async getFlowVersionOrThrow(
    client: PoolClient,
    tenantId: string,
    flowId: string,
    versionId: string,
  ): Promise<FlowVersionRecord> {
    const result = await client.query<FlowVersionRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          flow_id::text AS flow_id,
          version,
          graph_json,
          compiled_graph_json,
          checksum,
          changelog,
          published_by::text AS published_by,
          published_at::text AS published_at,
          created_at::text AS created_at
        FROM flow_versions
        WHERE id = $1::uuid
          AND tenant_id = $2::uuid
          AND flow_id = $3::uuid
        LIMIT 1
      `,
      [versionId, tenantId, flowId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new FlowHistoryApiError(404, 'FLOW_VERSION_NOT_FOUND', '未找到对应历史版本');
    }
    return row;
  }

  private async getOrCreateFlowDraft(
    client: PoolClient,
    context: FlowHistoryContext,
    flow: FlowRecord,
  ): Promise<FlowDraftView> {
    const existing = await client.query<FlowDraftRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          project_id::text AS project_id,
          flow_id::text AS flow_id,
          graph_json,
          revision,
          last_saved_by::text AS last_saved_by,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM flow_drafts
        WHERE flow_id = $1::uuid
        LIMIT 1
      `,
      [flow.id],
    );

    if (existing.rows[0]) {
      return mapDraft(existing.rows[0]);
    }

    const created = await client.query<FlowDraftRecord>(
      `
        INSERT INTO flow_drafts (
          tenant_id,
          project_id,
          flow_id,
          graph_json,
          revision,
          last_saved_by,
          updated_at
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::jsonb,
          1,
          $5::uuid,
          now()
        )
        RETURNING
          id::text AS id,
          tenant_id::text AS tenant_id,
          project_id::text AS project_id,
          flow_id::text AS flow_id,
          graph_json,
          revision,
          last_saved_by::text AS last_saved_by,
          created_at::text AS created_at,
          updated_at::text AS updated_at
      `,
      [
        context.tenantId,
        flow.project_id,
        flow.id,
        JSON.stringify({
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        }),
        context.userId,
      ],
    );

    return mapDraft(created.rows[0]);
  }
}
