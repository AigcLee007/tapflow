import { createHash } from 'node:crypto';
import { createPgPool, withTenantTransaction } from '@aigc-flow/db';
import type { Pool, PoolClient } from 'pg';

import type {
  FlowTemplateAdminListQuery,
  InstantiateFlowTemplateInput,
  FlowTemplateListQuery,
  SaveFlowTemplateDraftInput,
} from './flow-templates.schemas.js';

type PgPool = Pool;

export type FlowTemplateContext = {
  tenantId: string;
  userId: string | null;
};

export type SystemAdminFlowTemplateContext = Required<FlowTemplateContext>;

/**
 * Establishes the database RLS context for service methods reached through an
 * already-authorized `admin:system` route. Never derive this flag from input.
 */
export async function withSystemAdminFlowTemplateTransaction<T>(
  ctx: SystemAdminFlowTemplateContext,
  fn: (client: PoolClient) => Promise<T>,
  pool: Pool,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenantId]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [ctx.userId]);
    await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

type FlowTemplateRecord = {
  category: string;
  cover_asset_id: string | null;
  created_at: string;
  created_by: string | null;
  description: string;
  estimated_credits: string | null;
  graph_json: Record<string, unknown>;
  id: string;
  input_schema: unknown[];
  node_count: number;
  published_at: string | null;
  published_by: string | null;
  status: 'archived' | 'draft' | 'published' | 'testing';
  tenant_id: string | null;
  title: string;
  updated_at: string;
  version: number;
  version_snapshot_id: string | null;
  visibility: 'official' | 'private' | 'tenant';
};

export type FlowTemplateView = {
  category: string;
  coverAssetId: string | null;
  createdAt: string;
  createdBy: string | null;
  description: string;
  estimatedCredits: number | null;
  graph: Record<string, unknown>;
  id: string;
  inputSchema: unknown[];
  nodeCount: number;
  publishedAt: string | null;
  publishedBy: string | null;
  status: 'archived' | 'draft' | 'published' | 'testing';
  tenantId: string | null;
  title: string;
  updatedAt: string;
  version: number;
  versionId: string | null;
  visibility: 'official' | 'private' | 'tenant';
};

type TemplateGraph = {
  edges: Array<Record<string, unknown>>;
  nodes: Array<Record<string, unknown>>;
};

function normalizeTemplateGraph(value: Record<string, unknown>): TemplateGraph {
  const nodes = Array.isArray(value.nodes) ? value.nodes : null;
  const edges = Array.isArray(value.edges) ? value.edges : null;
  if (!nodes || !edges) {
    throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_GRAPH', '模板必须包含 nodes 和 edges 数组');
  }

  const nodeIds = new Set<string>();
  const normalizedNodes = nodes.map((rawNode) => {
    if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) {
      throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_GRAPH', '模板节点无效');
    }
    const node = { ...(rawNode as Record<string, unknown>) };
    if (typeof node.id !== 'string' || !node.id) {
      throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_GRAPH', '模板节点缺少 ID');
    }
    if (nodeIds.has(node.id)) {
      throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_GRAPH', '模板节点 ID 重复');
    }
    nodeIds.add(node.id);
    delete node.selected;
    delete node.dragging;
    delete node.measured;
    return node;
  });

  const normalizedEdges = edges.map((rawEdge) => {
    if (!rawEdge || typeof rawEdge !== 'object' || Array.isArray(rawEdge)) {
      throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_GRAPH', '模板连线无效');
    }
    const edge = { ...(rawEdge as Record<string, unknown>) };
    if (typeof edge.source !== 'string' || typeof edge.target !== 'string' || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_GRAPH', '模板不能包含外部连线');
    }
    delete edge.selected;
    return edge;
  });

  const containsUnsafeValue = (input: unknown): boolean => {
    if (typeof input === 'string') {
      if (/^(data:|blob:)/i.test(input)) return true;
      try {
        const url = new URL(input);
        if (!/^https?:$/.test(url.protocol)) return false;
        return [...url.searchParams.keys()].some((key) => /^(x-(amz|goog)-(algorithm|credential|date|expires|signedheaders|signature)|signature|expires|token)$/i.test(key));
      } catch { return false; }
    }
    if (Array.isArray(input)) return input.some(containsUnsafeValue);
    if (!input || typeof input !== 'object') return false;
    return Object.entries(input as Record<string, unknown>).some(([key, value]) =>
      /(authorization|api[_-]?key|credential|secret|token)/i.test(key) || containsUnsafeValue(value));
  };
  if (containsUnsafeValue({ nodes: normalizedNodes, edges: normalizedEdges })) {
    throw new FlowTemplatesApiError(400, 'UNSAFE_TEMPLATE_GRAPH', '模板不能包含临时媒体地址或敏感凭据');
  }

  const positions = normalizedNodes
    .map((node) => node.position)
    .filter((position): position is { x: number; y: number } => Boolean(position && typeof position === 'object' && typeof (position as { x?: unknown }).x === 'number' && typeof (position as { y?: unknown }).y === 'number'));
  const minX = positions.length ? Math.min(...positions.map((position) => position.x)) : 0;
  const minY = positions.length ? Math.min(...positions.map((position) => position.y)) : 0;
  normalizedNodes.forEach((node) => {
    const position = node.position;
    if (position && typeof position === 'object' && typeof (position as { x?: unknown }).x === 'number' && typeof (position as { y?: unknown }).y === 'number') {
      node.position = { x: (position as { x: number }).x - minX, y: (position as { y: number }).y - minY };
    }
  });
  return { nodes: normalizedNodes, edges: normalizedEdges };
}

function validateTemplateInputs(inputSchema: unknown[], graph: TemplateGraph): void {
  const nodeById = new Map(graph.nodes.map((node) => [node.id as string, node]));
  for (const input of inputSchema) {
    const target = input && typeof input === 'object' ? (input as { target?: { nodeId?: unknown; fieldPath?: unknown } }).target : undefined;
    const node = typeof target?.nodeId === 'string' ? nodeById.get(target.nodeId) : undefined;
    const segments = typeof target?.fieldPath === 'string' ? target.fieldPath.split('.') : [];
    let field: unknown = node;
    for (const segment of segments) {
      field = field && typeof field === 'object' ? (field as Record<string, unknown>)[segment] : undefined;
    }
    if (!node || field === undefined) {
      throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_INPUT', '模板输入必须绑定到模板内节点');
    }
  }
}

export class FlowTemplatesApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'FlowTemplatesApiError';
    this.statusCode = statusCode;
  }
}

export function mapFlowTemplateRecord(row: FlowTemplateRecord): FlowTemplateView {
  return {
    category: row.category,
    coverAssetId: row.cover_asset_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    description: row.description,
    estimatedCredits: row.estimated_credits === null ? null : Number(row.estimated_credits),
    graph: row.graph_json,
    id: row.id,
    inputSchema: row.input_schema,
    nodeCount: row.node_count,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    status: row.status,
    tenantId: row.tenant_id,
    title: row.title,
    updatedAt: row.updated_at,
    version: row.version,
    versionId: row.version_snapshot_id,
    visibility: row.visibility,
  };
}

export class FlowTemplatesService {
  readonly pool: PgPool;

  constructor(options?: { pool?: PgPool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async listTemplates(ctx: FlowTemplateContext, query: FlowTemplateListQuery): Promise<FlowTemplateView[]> {
    return withTenantTransaction(ctx, async (client) => {
      const result = await client.query<FlowTemplateRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            created_by::text AS created_by,
            title,
            description,
            category,
            visibility,
            cover_asset_id::text AS cover_asset_id,
            version_snapshot.graph_json,
            version_snapshot.input_schema,
            version_snapshot.node_count,
            version_snapshot.estimated_credits::text AS estimated_credits,
            status,
            version,
            version_snapshot.id::text AS version_snapshot_id,
            published_at::text AS published_at,
            published_by::text AS published_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM flow_templates
          INNER JOIN flow_template_versions AS version_snapshot
            ON version_snapshot.template_id = flow_templates.id
            AND version_snapshot.version = flow_templates.version
          WHERE tenant_id IS NULL
            AND visibility = 'official'
            AND status = 'published'
            AND ($1::text IS NULL OR category = $1)
            AND (
              $2::text IS NULL
              OR title ILIKE '%' || $2 || '%'
              OR description ILIKE '%' || $2 || '%'
            )
          ORDER BY
            updated_at DESC,
            id ASC
        `,
        [query.category ?? null, query.query?.trim() || null],
      );

      return result.rows.map(mapFlowTemplateRecord);
    }, this.pool);
  }

  async getTemplateGraph(ctx: FlowTemplateContext, templateId: string): Promise<FlowTemplateView> {
    return withTenantTransaction(ctx, async (client) => {
      const result = await client.query<FlowTemplateRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            created_by::text AS created_by,
            title,
            description,
            category,
            visibility,
            cover_asset_id::text AS cover_asset_id,
            version_snapshot.graph_json,
            version_snapshot.input_schema,
            version_snapshot.node_count,
            version_snapshot.estimated_credits::text AS estimated_credits,
            status,
            version,
            version_snapshot.id::text AS version_snapshot_id,
            published_at::text AS published_at,
            published_by::text AS published_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM flow_templates
          INNER JOIN flow_template_versions AS version_snapshot
            ON version_snapshot.template_id = flow_templates.id
            AND version_snapshot.version = flow_templates.version
          WHERE id = $1::uuid
            AND tenant_id IS NULL
            AND visibility = 'official'
            AND status = 'published'
          LIMIT 1
        `,
        [templateId],
      );

      const row = result.rows[0];
      if (!row) {
        throw new FlowTemplatesApiError(404, 'FLOW_TEMPLATE_NOT_FOUND', '未找到对应模板');
      }

      return mapFlowTemplateRecord(row);
    }, this.pool);
  }

  async recordUsage(ctx: FlowTemplateContext, templateId: string, projectId?: string): Promise<{ ok: true }> {
    return withTenantTransaction(ctx, async (client) => {
      const template = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM flow_templates
          WHERE id = $1::uuid
            AND tenant_id IS NULL
            AND visibility = 'official'
            AND status = 'published'
          LIMIT 1
        `,
        [templateId],
      );

      if (!template.rows[0]) {
        throw new FlowTemplatesApiError(404, 'FLOW_TEMPLATE_NOT_FOUND', '未找到对应模板');
      }

      if (projectId) {
        const project = await client.query<{ id: string }>(
          `
            SELECT id::text AS id
            FROM projects
            WHERE id = $1::uuid
              AND tenant_id = $2::uuid
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [projectId, ctx.tenantId],
        );

        if (!project.rows[0]) {
          throw new FlowTemplatesApiError(404, 'PROJECT_NOT_FOUND', '未找到对应项目');
        }
      }

      await client.query(
        `
          INSERT INTO flow_template_usage (
            tenant_id,
            template_id,
            user_id,
            project_id
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)
        `,
        [ctx.tenantId, templateId, ctx.userId, projectId ?? null],
      );

      return { ok: true as const };
    }, this.pool);
  }

  async instantiate(ctx: FlowTemplateContext, templateId: string, input: InstantiateFlowTemplateInput): Promise<{ graph: Record<string, unknown>; version: number }> {
    return withTenantTransaction(ctx, async (client) => {
      const result = await client.query<FlowTemplateRecord>(`SELECT id::text AS id, tenant_id::text AS tenant_id, created_by::text AS created_by, title, description, category, visibility, cover_asset_id::text AS cover_asset_id, graph_json, input_schema, node_count, estimated_credits::text AS estimated_credits, status, version, NULL::text AS version_snapshot_id, published_at::text AS published_at, published_by::text AS published_by, created_at::text AS created_at, updated_at::text AS updated_at FROM flow_templates WHERE id=$1::uuid AND tenant_id IS NULL AND visibility='official' AND status='published' FOR UPDATE`, [templateId]);
      const template = result.rows[0];
      if (!template) throw new FlowTemplatesApiError(404, 'FLOW_TEMPLATE_NOT_FOUND', '未找到对应模板');
      if (input.projectId) {
        const project = await client.query(`SELECT id FROM projects WHERE id=$1::uuid AND tenant_id=$2::uuid AND deleted_at IS NULL`, [input.projectId, ctx.tenantId]);
        if (!project.rows[0]) throw new FlowTemplatesApiError(404, 'PROJECT_NOT_FOUND', '未找到对应项目');
      }
      const graph = normalizeTemplateGraph(template.graph_json);
      validateTemplateInputs(template.input_schema, graph);
      const nodes = new Map(graph.nodes.map((node) => [String(node.id), structuredClone(node)]));
      for (const raw of template.input_schema as Array<Record<string, unknown>>) {
        const id = String(raw.id); const supplied = input.inputValues[id]; const value = supplied ?? raw.defaultValue;
        if ((value === undefined || value === '') && raw.required) throw new FlowTemplatesApiError(400, 'TEMPLATE_INPUT_REQUIRED', `模板输入 ${String(raw.label)} 为必填项`);
        if (value === undefined || value === '') continue;
        if ((raw.type === 'text' || raw.type === 'asset' || raw.type === 'enum') && typeof value !== 'string') throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_INPUT', '模板输入类型不匹配');
        if (raw.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_INPUT', '模板输入类型不匹配');
        if (raw.type === 'enum' && (!Array.isArray(raw.options) || !raw.options.includes(value))) throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_INPUT', '枚举输入不在可选项中');
        if (raw.type === 'number' && typeof value === 'number' && ((typeof raw.minimum === 'number' && value < raw.minimum) || (typeof raw.maximum === 'number' && value > raw.maximum))) throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_INPUT', '数字输入超出范围');
        if (raw.type === 'asset') {
          const asset = await client.query(`SELECT id FROM assets WHERE id=$1::uuid AND tenant_id=$2::uuid AND deleted_at IS NULL`, [value, ctx.tenantId]);
          if (!asset.rows[0]) throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_ASSET', '素材不存在或不属于当前工作区');
        }
        const target = raw.target as { nodeId?: string; fieldPath?: string }; const segments = String(target?.fieldPath ?? '').split('.');
        if (segments.shift() !== 'data' || !target.nodeId || segments.some((segment) => ['__proto__', 'constructor', 'prototype'].includes(segment))) throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_INPUT', '模板输入字段无效');
        const node = nodes.get(target.nodeId); let cursor = node?.data as Record<string, unknown> | undefined;
        for (const segment of segments.slice(0, -1)) { if (!cursor || !Object.prototype.hasOwnProperty.call(cursor, segment) || !cursor[segment] || typeof cursor[segment] !== 'object') throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_INPUT', '模板输入字段无效'); cursor = cursor[segment] as Record<string, unknown>; }
        if (!cursor || !Object.prototype.hasOwnProperty.call(cursor, segments.at(-1)!)) throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_INPUT', '模板输入字段无效');
        cursor[segments.at(-1)!] = value;
      }
      await client.query(`INSERT INTO flow_template_usage (tenant_id, template_id, user_id, project_id, template_version, idempotency_key) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::uuid) ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`, [ctx.tenantId, templateId, ctx.userId, input.projectId ?? null, template.version, input.idempotencyKey]);
      return { graph: { nodes: [...nodes.values()], edges: graph.edges }, version: template.version };
    }, this.pool);
  }

  async listAdminTemplates(ctx: SystemAdminFlowTemplateContext, query: FlowTemplateAdminListQuery): Promise<FlowTemplateView[]> {
    return withSystemAdminFlowTemplateTransaction(ctx, async (client) => {
      const result = await client.query<FlowTemplateRecord>(`
        SELECT id::text AS id, tenant_id::text AS tenant_id, created_by::text AS created_by, title, description, category,
          visibility, cover_asset_id::text AS cover_asset_id, graph_json, input_schema, node_count,
          estimated_credits::text AS estimated_credits, status, version, NULL::text AS version_snapshot_id,
          published_at::text AS published_at, published_by::text AS published_by, created_at::text AS created_at, updated_at::text AS updated_at
        FROM flow_templates
        WHERE tenant_id IS NULL AND ($1::text IS NULL OR status = $1)
          AND ($2::text IS NULL OR category = $2)
          AND ($3::text IS NULL OR title ILIKE '%' || $3 || '%' OR description ILIKE '%' || $3 || '%')
        ORDER BY updated_at DESC, id ASC`, [query.status ?? null, query.category ?? null, query.query?.trim() || null]);
      return result.rows.map(mapFlowTemplateRecord);
    }, this.pool);
  }

  async getAdminTemplate(ctx: SystemAdminFlowTemplateContext, templateId: string): Promise<FlowTemplateView> {
    return withSystemAdminFlowTemplateTransaction(ctx, async (client) => this.getAdminTemplateForUpdate(client, templateId), this.pool);
  }

  async createDraft(ctx: SystemAdminFlowTemplateContext, input: SaveFlowTemplateDraftInput): Promise<FlowTemplateView> {
    const graph = normalizeTemplateGraph(input.graph);
    validateTemplateInputs(input.inputSchema, graph);
    return withSystemAdminFlowTemplateTransaction(ctx, async (client) => {
      const result = await client.query<FlowTemplateRecord>(`
        INSERT INTO flow_templates (tenant_id, created_by, title, description, category, visibility, cover_asset_id, graph_json, input_schema, node_count, estimated_credits, status)
        VALUES (NULL, $1::uuid, $2, $3, $4, 'official', $5::uuid, $6::jsonb, $7::jsonb, $8, $9, 'draft')
        RETURNING id::text AS id, tenant_id::text AS tenant_id, created_by::text AS created_by, title, description, category, visibility,
          cover_asset_id::text AS cover_asset_id, graph_json, input_schema, node_count, estimated_credits::text AS estimated_credits, status,
          version, NULL::text AS version_snapshot_id, published_at::text AS published_at, published_by::text AS published_by, created_at::text AS created_at, updated_at::text AS updated_at`,
        [ctx.userId, input.title, input.description, input.category, input.coverAssetId ?? null, JSON.stringify(graph), JSON.stringify(input.inputSchema), graph.nodes.length, input.estimatedCredits ?? null]);
      return mapFlowTemplateRecord(result.rows[0]!);
    }, this.pool);
  }

  async updateDraft(ctx: SystemAdminFlowTemplateContext, templateId: string, input: SaveFlowTemplateDraftInput): Promise<FlowTemplateView> {
    const graph = normalizeTemplateGraph(input.graph);
    validateTemplateInputs(input.inputSchema, graph);
    return withSystemAdminFlowTemplateTransaction(ctx, async (client) => {
      const current = await this.getAdminTemplateForUpdate(client, templateId);
      if (current.status === 'archived') throw new FlowTemplatesApiError(409, 'FLOW_TEMPLATE_ARCHIVED', '已下架模板不可修改');
      const result = await client.query<FlowTemplateRecord>(`
        UPDATE flow_templates SET title=$2, description=$3, category=$4, cover_asset_id=$5::uuid,
          graph_json = CASE WHEN status = 'published' THEN graph_json ELSE $6::jsonb END,
          input_schema = CASE WHEN status = 'published' THEN input_schema ELSE $7::jsonb END,
          node_count = CASE WHEN status = 'published' THEN node_count ELSE $8 END,
          estimated_credits = CASE WHEN status = 'published' THEN estimated_credits ELSE $9 END,
          draft_graph_json = CASE WHEN status = 'published' THEN $6::jsonb ELSE draft_graph_json END,
          draft_input_schema = CASE WHEN status = 'published' THEN $7::jsonb ELSE draft_input_schema END,
          draft_node_count = CASE WHEN status = 'published' THEN $8 ELSE draft_node_count END,
          draft_estimated_credits = CASE WHEN status = 'published' THEN $9 ELSE draft_estimated_credits END,
          draft_status = CASE WHEN status = 'published' THEN 'draft' ELSE draft_status END, updated_at=now()
        WHERE id=$1::uuid
        RETURNING id::text AS id, tenant_id::text AS tenant_id, created_by::text AS created_by, title, description, category, visibility,
          cover_asset_id::text AS cover_asset_id, graph_json, input_schema, node_count, estimated_credits::text AS estimated_credits, status,
          version, NULL::text AS version_snapshot_id, published_at::text AS published_at, published_by::text AS published_by, created_at::text AS created_at, updated_at::text AS updated_at`,
        [templateId, input.title, input.description, input.category, input.coverAssetId ?? null, JSON.stringify(graph), JSON.stringify(input.inputSchema), graph.nodes.length, input.estimatedCredits ?? null]);
      return mapFlowTemplateRecord(result.rows[0]!);
    }, this.pool);
  }

  async markTesting(ctx: SystemAdminFlowTemplateContext, templateId: string): Promise<FlowTemplateView> {
    return this.validateDraft(ctx, templateId);
  }

  async validateDraft(ctx: SystemAdminFlowTemplateContext, templateId: string): Promise<FlowTemplateView> {
    return withSystemAdminFlowTemplateTransaction(ctx, async (client) => {
      const current = await this.getAdminTemplateForUpdate(client, templateId);
      let graph = current.graph;
      let inputSchema = current.inputSchema;
      if (current.status === 'published') {
        const draft = await client.query<{ draft_graph_json: Record<string, unknown> | null; draft_input_schema: unknown[] | null }>(
          'SELECT draft_graph_json, draft_input_schema FROM flow_templates WHERE id=$1::uuid', [templateId]);
        if (!draft.rows[0]?.draft_graph_json) {
          throw new FlowTemplatesApiError(409, 'FLOW_TEMPLATE_DRAFT_REQUIRED', '请先保存下一版本草稿');
        }
        graph = draft.rows[0].draft_graph_json;
        inputSchema = draft.rows[0].draft_input_schema ?? [];
      }
      const normalizedGraph = normalizeTemplateGraph(graph);
      validateTemplateInputs(inputSchema, normalizedGraph);
      if (!normalizedGraph.nodes.length) throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_GRAPH', '模板至少需要一个节点');
      const graphHash = createHash('sha256').update(JSON.stringify({ graph: normalizedGraph, inputSchema })).digest('hex');
      const result = await client.query<FlowTemplateRecord>(`UPDATE flow_templates
        SET status = CASE WHEN status = 'published' THEN status ELSE 'testing' END,
          draft_status = CASE WHEN status = 'published' THEN 'testing' ELSE draft_status END,
          last_tested_at=now(), last_tested_by=$2::uuid, last_tested_graph_hash=$3, updated_at=now()
        WHERE id=$1::uuid
        RETURNING id::text AS id, tenant_id::text AS tenant_id, created_by::text AS created_by, title, description, category, visibility,
          cover_asset_id::text AS cover_asset_id, graph_json, input_schema, node_count, estimated_credits::text AS estimated_credits, status,
          version, NULL::text AS version_snapshot_id, published_at::text AS published_at, published_by::text AS published_by, created_at::text AS created_at, updated_at::text AS updated_at`, [templateId, ctx.userId, graphHash]);
      return mapFlowTemplateRecord(result.rows[0]!);
    }, this.pool);
  }

  async archive(ctx: SystemAdminFlowTemplateContext, templateId: string): Promise<FlowTemplateView> {
    return this.transitionStatus(ctx, templateId, 'archived');
  }

  async publish(ctx: SystemAdminFlowTemplateContext, templateId: string): Promise<FlowTemplateView> {
    return withSystemAdminFlowTemplateTransaction(ctx, async (client) => {
      const current = await this.getAdminTemplateForUpdate(client, templateId);
      const draft = await client.query<{ graph_json: Record<string, unknown>; input_schema: unknown[]; node_count: number; estimated_credits: string | null; draft_status: string | null; last_tested_graph_hash: string | null }>(
        `SELECT draft_graph_json AS graph_json, draft_input_schema AS input_schema, draft_node_count AS node_count,
          draft_estimated_credits::text AS estimated_credits, draft_status, last_tested_graph_hash FROM flow_templates WHERE id=$1::uuid`, [templateId]);
      const source = current.status === 'published' ? draft.rows[0] : { graph_json: current.graph, input_schema: current.inputSchema, node_count: current.nodeCount, estimated_credits: current.estimatedCredits === null ? null : String(current.estimatedCredits), draft_status: current.status, last_tested_graph_hash: draft.rows[0]?.last_tested_graph_hash ?? null };
      if (source?.draft_status !== 'testing') throw new FlowTemplatesApiError(409, 'FLOW_TEMPLATE_NOT_READY', '模板必须先通过测试');
      const graph = normalizeTemplateGraph(source.graph_json);
      validateTemplateInputs(source.input_schema, graph);
      if (!graph.nodes.length) throw new FlowTemplatesApiError(400, 'INVALID_TEMPLATE_GRAPH', '模板至少需要一个节点');
      const graphHash = createHash('sha256').update(JSON.stringify({ graph, inputSchema: source.input_schema })).digest('hex');
      if (source.last_tested_graph_hash !== graphHash) throw new FlowTemplatesApiError(409, 'FLOW_TEMPLATE_TEST_REQUIRED', '模板草稿变更后必须重新验证');
      const nextVersion = current.version + 1;
      await client.query(`INSERT INTO flow_template_versions (template_id, version, graph_json, input_schema, node_count, estimated_credits, created_by)
        VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb, $5, $6, $7::uuid)`, [templateId, nextVersion, JSON.stringify(graph), JSON.stringify(source.input_schema), graph.nodes.length, source.estimated_credits, ctx.userId]);
      const result = await client.query<FlowTemplateRecord>(`UPDATE flow_templates SET graph_json=$2::jsonb, input_schema=$3::jsonb, node_count=$4, estimated_credits=$5, version=$6, status='published', published_at=now(), published_by=$7::uuid,
        draft_graph_json=NULL, draft_input_schema=NULL, draft_node_count=NULL, draft_estimated_credits=NULL, draft_status=NULL, last_tested_at=NULL, last_tested_by=NULL, last_tested_graph_hash=NULL, updated_at=now()
        WHERE id=$1::uuid
        RETURNING id::text AS id, tenant_id::text AS tenant_id, created_by::text AS created_by, title, description, category, visibility,
          cover_asset_id::text AS cover_asset_id, graph_json, input_schema, node_count, estimated_credits::text AS estimated_credits, status,
          version, $6::text AS version_snapshot_id, published_at::text AS published_at, published_by::text AS published_by, created_at::text AS created_at, updated_at::text AS updated_at`,
        [templateId, JSON.stringify(graph), JSON.stringify(source.input_schema), graph.nodes.length, source.estimated_credits, nextVersion, ctx.userId, null]);
      return mapFlowTemplateRecord(result.rows[0]!);
    }, this.pool);
  }

  private async transitionStatus(ctx: SystemAdminFlowTemplateContext, templateId: string, status: 'testing' | 'archived'): Promise<FlowTemplateView> {
    return withSystemAdminFlowTemplateTransaction(ctx, async (client) => {
      await this.getAdminTemplateForUpdate(client, templateId);
      const result = await client.query<FlowTemplateRecord>(`UPDATE flow_templates SET status=$2, updated_at=now() WHERE id=$1::uuid
        RETURNING id::text AS id, tenant_id::text AS tenant_id, created_by::text AS created_by, title, description, category, visibility,
          cover_asset_id::text AS cover_asset_id, graph_json, input_schema, node_count, estimated_credits::text AS estimated_credits, status,
          version, NULL::text AS version_snapshot_id, published_at::text AS published_at, published_by::text AS published_by, created_at::text AS created_at, updated_at::text AS updated_at`, [templateId, status]);
      return mapFlowTemplateRecord(result.rows[0]!);
    }, this.pool);
  }

  private async getAdminTemplateForUpdate(client: PoolClient, templateId: string): Promise<FlowTemplateView> {
    const result = await client.query<FlowTemplateRecord>(`SELECT id::text AS id, tenant_id::text AS tenant_id, created_by::text AS created_by, title, description, category, visibility,
      cover_asset_id::text AS cover_asset_id, graph_json, input_schema, node_count, estimated_credits::text AS estimated_credits, status, version,
      NULL::text AS version_snapshot_id, published_at::text AS published_at, published_by::text AS published_by, created_at::text AS created_at, updated_at::text AS updated_at
      FROM flow_templates WHERE id=$1::uuid AND tenant_id IS NULL FOR UPDATE`, [templateId]);
    if (!result.rows[0]) throw new FlowTemplatesApiError(404, 'FLOW_TEMPLATE_NOT_FOUND', '未找到对应模板');
    return mapFlowTemplateRecord(result.rows[0]);
  }
}
