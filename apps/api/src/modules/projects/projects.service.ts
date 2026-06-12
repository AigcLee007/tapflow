import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { Pool } from "pg";

type PgPool = Pool;

type ProjectRecord = {
  cover_asset_id: string | null;
  created_at: string;
  created_by: string | null;
  description: string | null;
  id: string;
  name: string;
  tenant_id: string;
  updated_at: string;
};

type ProjectWithDraftCoverRecord = ProjectRecord & {
  draft_cover_asset_id: string | null;
  draft_graph_json?: unknown;
};

export type ProjectView = {
  coverAssetId: string | null;
  createdAt: string;
  createdBy: string | null;
  description: string | null;
  id: string;
  name: string;
  tenantId: string;
  updatedAt: string;
};

export type ProjectContext = {
  tenantId: string;
  userId: string | null;
};

export class ProjectsApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ProjectsApiError";
    this.statusCode = statusCode;
  }
}

function getStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getAssetIdFromResultId(resultId: unknown): string {
  const value = getStringValue(resultId);
  return value.startsWith("asset:") ? value.slice("asset:".length).trim() : "";
}

function getFirstGeneratedCoverAssetId(nodes: Record<string, unknown>[]): string {
  for (const node of nodes) {
    const data = node.data && typeof node.data === "object" ? node.data as Record<string, unknown> : {};
    const generatedResults = Array.isArray(data.generatedResults) ? data.generatedResults : [];
    for (const result of generatedResults) {
      if (!result || typeof result !== "object") continue;
      const resultRecord = result as Record<string, unknown>;
      const resultAssetId =
        getAssetIdFromResultId(resultRecord.id) ||
        getStringValue(resultRecord.assetId) ||
        getStringValue(resultRecord.resultAssetId);
      if (resultAssetId) return resultAssetId;
    }

    const runtimeOutput = data.runtimeOutput && typeof data.runtimeOutput === "object"
      ? data.runtimeOutput as Record<string, unknown>
      : {};
    const runtimeAssets = Array.isArray(runtimeOutput.assets) ? runtimeOutput.assets : [];
    for (const asset of runtimeAssets) {
      if (!asset || typeof asset !== "object") continue;
      const assetRecord = asset as Record<string, unknown>;
      if (getStringValue(assetRecord.kind) !== "image") continue;
      const assetId = getStringValue(assetRecord.assetId);
      if (assetId) return assetId;
    }
  }

  return "";
}

function getFirstUploadedCoverAssetId(nodes: Record<string, unknown>[]): string {
  for (const node of nodes) {
    const type = getStringValue(node.type);
    const data = node.data && typeof node.data === "object" ? node.data as Record<string, unknown> : {};
    const kind = getStringValue(data.kind);
    const source = getStringValue(data.source);
    const mimeType = getStringValue(data.mimeType);
    const assetId = getStringValue(data.assetId);
    const looksUploadedImage =
      assetId &&
      (type === "upload" ||
        kind === "upload" ||
        source === "canvas-upload" ||
        source === "node-upload" ||
        (kind === "image" && mimeType.startsWith("image/") && !Array.isArray(data.generatedResults)));
    if (looksUploadedImage) return assetId;
  }

  return "";
}

export function inferProjectCoverAssetIdFromDraftGraph(graph: unknown): string | null {
  const input = graph && typeof graph === "object" ? graph as { nodes?: unknown } : {};
  const nodes = Array.isArray(input.nodes)
    ? input.nodes.filter((node): node is Record<string, unknown> => Boolean(node && typeof node === "object"))
    : [];
  return getFirstGeneratedCoverAssetId(nodes) || getFirstUploadedCoverAssetId(nodes) || null;
}

function mapProject(row: ProjectRecord & { draft_cover_asset_id?: string | null; draft_graph_json?: unknown }): ProjectView {
  return {
    coverAssetId: row.cover_asset_id ?? row.draft_cover_asset_id ?? inferProjectCoverAssetIdFromDraftGraph(row.draft_graph_json),
    createdAt: row.created_at,
    createdBy: row.created_by,
    description: row.description,
    id: row.id,
    name: row.name,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
  };
}

export class ProjectsService {
  readonly pool: PgPool;

  constructor(options?: { pool?: PgPool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async listProjects(context: ProjectContext): Promise<ProjectView[]> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<ProjectWithDraftCoverRecord>(
        `
          WITH latest_drafts AS (
            SELECT DISTINCT ON (project_id)
              project_id,
              graph_json
            FROM flow_drafts
            WHERE tenant_id = $1::uuid
            ORDER BY project_id, updated_at DESC, id DESC
          )
          SELECT
            projects.id::text AS id,
            projects.tenant_id::text AS tenant_id,
            projects.name,
            projects.description,
            projects.cover_asset_id::text AS cover_asset_id,
            projects.created_by::text AS created_by,
            projects.created_at::text AS created_at,
            projects.updated_at::text AS updated_at,
            NULL::text AS draft_cover_asset_id,
            latest_drafts.graph_json AS draft_graph_json
          FROM projects
          LEFT JOIN latest_drafts
            ON latest_drafts.project_id = projects.id
          WHERE tenant_id = $1::uuid
            AND deleted_at IS NULL
          ORDER BY projects.created_at ASC, projects.id ASC
        `,
        [context.tenantId],
      );

      return result.rows.map(mapProject);
    }, this.pool);
  }

  async createProject(
    context: ProjectContext,
    input: {
      description?: string | null;
      name: string;
    },
  ): Promise<ProjectView> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<ProjectRecord>(
        `
          INSERT INTO projects (
            tenant_id,
            name,
            description,
            created_by,
            updated_at
          )
          VALUES ($1::uuid, $2, $3, $4::uuid, now())
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            name,
            description,
            cover_asset_id::text AS cover_asset_id,
            created_by::text AS created_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          context.tenantId,
          input.name.trim(),
          input.description?.trim() ?? null,
          context.userId,
        ],
      );

      return mapProject(result.rows[0]);
    }, this.pool);
  }

  async getProject(context: ProjectContext, projectId: string): Promise<ProjectView> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<ProjectWithDraftCoverRecord>(
        `
          WITH latest_draft AS (
            SELECT graph_json
            FROM flow_drafts
            WHERE project_id = $1::uuid
              AND tenant_id = $2::uuid
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
          )
          SELECT
            projects.id::text AS id,
            projects.tenant_id::text AS tenant_id,
            projects.name,
            projects.description,
            projects.cover_asset_id::text AS cover_asset_id,
            projects.created_by::text AS created_by,
            projects.created_at::text AS created_at,
            projects.updated_at::text AS updated_at,
            NULL::text AS draft_cover_asset_id,
            latest_draft.graph_json AS draft_graph_json
          FROM projects
          LEFT JOIN latest_draft ON true
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [projectId, context.tenantId],
      );

      const row = result.rows[0];
      if (!row) {
        throw new ProjectsApiError(404, "PROJECT_NOT_FOUND", "未找到对应项目");
      }

      return mapProject(row);
    }, this.pool);
  }

  async updateProject(
    context: ProjectContext,
    projectId: string,
    input: {
      coverAssetId?: string | null;
      description?: string | null;
      name?: string;
    },
  ): Promise<ProjectView> {
    return withTenantTransaction(context, async (client) => {
      const existing = await client.query<ProjectRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            name,
            description,
            cover_asset_id::text AS cover_asset_id,
            created_by::text AS created_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM projects
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [projectId, context.tenantId],
      );

      const row = existing.rows[0];
      if (!row) {
        throw new ProjectsApiError(404, "PROJECT_NOT_FOUND", "未找到对应项目");
      }

      if (input.coverAssetId) {
        const cover = await client.query<{ id: string }>(
          `
            SELECT id::text AS id
            FROM assets
            WHERE id = $1::uuid
              AND tenant_id = $2::uuid
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [input.coverAssetId, context.tenantId],
        );

        if (!cover.rows[0]) {
          throw new ProjectsApiError(404, "ASSET_NOT_FOUND", "未找到项目封面素材");
        }
      }

      const updated = await client.query<ProjectRecord>(
        `
          UPDATE projects
          SET
            name = $3,
            description = $4,
            cover_asset_id = CASE WHEN $5::boolean THEN $6::uuid ELSE cover_asset_id END,
            updated_at = now()
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            name,
            description,
            cover_asset_id::text AS cover_asset_id,
            created_by::text AS created_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          projectId,
          context.tenantId,
          input.name?.trim() ?? row.name,
          input.description !== undefined ? input.description?.trim() ?? null : row.description,
          input.coverAssetId !== undefined,
          input.coverAssetId ?? null,
        ],
      );

      return mapProject(updated.rows[0]);
    }, this.pool);
  }

  async deleteProject(context: ProjectContext, projectId: string): Promise<{ ok: true }> {
    return withTenantTransaction(context, async (client) => {
      const deleted = await client.query<{ id: string }>(
        `
          UPDATE projects
          SET deleted_at = now(), updated_at = now()
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
            AND deleted_at IS NULL
          RETURNING id::text AS id
        `,
        [projectId, context.tenantId],
      );

      if (!deleted.rows[0]?.id) {
        throw new ProjectsApiError(404, "PROJECT_NOT_FOUND", "未找到对应项目");
      }

      return { ok: true as const };
    }, this.pool);
  }
}
