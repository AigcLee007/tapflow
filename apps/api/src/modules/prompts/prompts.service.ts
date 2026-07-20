import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { StorageProvider } from "@aigc-flow/storage";
import type { Pool, PoolClient } from "pg";

import {
  type PromptAdminInput,
  type PromptImportInput,
  type PromptInteractionInput,
  type PromptListQuery,
  promptImportRowSchema,
} from "./prompts.schemas.js";

type PgPool = Pool;

export type PromptContext = {
  tenantId: string;
  userId: string;
};

type PromptMediaRecord = {
  alt_text: string;
  asset_id: string;
  sort_order: number;
};

type PromptRecord = {
  category: string;
  created_at: string;
  created_by: string | null;
  description: string;
  external_key: string;
  id: string;
  is_favorite: boolean;
  media: PromptMediaRecord[];
  negative_prompt: string | null;
  prompt_text: string;
  published_at: string | null;
  sort_weight: number;
  status: "archived" | "draft" | "published";
  tags: string[];
  tenant_id: string | null;
  title: string;
  updated_at: string;
  version: number;
};

export type PromptMediaView = {
  altText: string;
  assetId: string;
  sortOrder: number;
};

export type PromptView = {
  category: string;
  createdAt: string;
  createdBy: string | null;
  description: string;
  externalKey: string;
  id: string;
  isFavorite: boolean;
  media: PromptMediaView[];
  negativePrompt: string | null;
  promptText: string;
  publishedAt: string | null;
  sortWeight: number;
  status: "archived" | "draft" | "published";
  tags: string[];
  tenantId: string | null;
  title: string;
  updatedAt: string;
  version: number;
};

export type PromptListView = {
  items: PromptView[];
  nextCursor: string | null;
};

export class PromptApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "PromptApiError";
    this.statusCode = statusCode;
  }
}

function mapPrompt(row: PromptRecord): PromptView {
  return {
    category: row.category,
    createdAt: row.created_at,
    createdBy: row.created_by,
    description: row.description,
    externalKey: row.external_key,
    id: row.id,
    isFavorite: row.is_favorite,
    media: Array.isArray(row.media)
      ? row.media.map((item) => ({
          altText: item.alt_text,
          assetId: item.asset_id,
          sortOrder: item.sort_order,
        }))
      : [],
    negativePrompt: row.negative_prompt,
    promptText: row.prompt_text,
    publishedAt: row.published_at,
    sortWeight: row.sort_weight,
    status: row.status,
    tags: row.tags ?? [],
    tenantId: row.tenant_id,
    title: row.title,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function promptSelectSql(): string {
  return `
    SELECT
      p.id::text AS id,
      p.tenant_id::text AS tenant_id,
      p.created_by::text AS created_by,
      p.external_key,
      p.title,
      p.description,
      p.prompt_text,
      p.negative_prompt,
      p.category,
      p.tags,
      p.status,
      p.sort_weight,
      p.version,
      p.published_at::text AS published_at,
      p.created_at::text AS created_at,
      p.updated_at::text AS updated_at,
      EXISTS (
        SELECT 1
        FROM prompt_favorites favorite
        WHERE favorite.prompt_id = p.id
          AND favorite.tenant_id = $1::uuid
          AND favorite.user_id = $2::uuid
      ) AS is_favorite,
      COALESCE((
        SELECT json_agg(
          json_build_object(
            'asset_id', media.asset_id::text,
            'sort_order', media.sort_order,
            'alt_text', media.alt_text
          ) ORDER BY media.sort_order ASC, media.asset_id ASC
        )
        FROM prompt_entry_media media
        WHERE media.prompt_id = p.id
      ), '[]'::json) AS media
    FROM prompt_entries p
  `;
}

async function withPromptTransaction<T>(
  context: PromptContext,
  callback: (client: PoolClient) => Promise<T>,
  systemAdmin = false,
  pool?: PgPool,
): Promise<T> {
  return withTenantTransaction(context, async (client) => {
    if (systemAdmin) {
      await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
    }
    return callback(client);
  }, pool);
}

export class PromptsService {
  readonly pool: PgPool;
  readonly storageProvider?: StorageProvider;

  constructor(options?: { pool?: PgPool; storageProvider?: StorageProvider }) {
    this.pool = options?.pool ?? createPgPool();
    this.storageProvider = options?.storageProvider;
  }

  async createCatalogMediaDownloadUrl(context: PromptContext, assetId: string): Promise<{ expiresAt: string; method: "GET"; url: string }> {
    if (!this.storageProvider) throw new PromptApiError(503, "PROMPT_MEDIA_UNAVAILABLE", "提示词媒体暂不可用");
    return withPromptTransaction(context, async (client) => {
      const result = await client.query<{ bucket: string; mime_type: string; object_key: string }>(
        `SELECT asset.bucket, asset.mime_type, asset.object_key
         FROM prompt_entry_media media
         JOIN prompt_entries prompt ON prompt.id = media.prompt_id
         JOIN assets asset ON asset.id = media.asset_id
         WHERE media.asset_id = $1::uuid
           AND prompt.status = 'published'
           AND (prompt.tenant_id IS NULL OR prompt.tenant_id = $2::uuid)
           AND asset.deleted_at IS NULL
           AND asset.status = 'available'
         LIMIT 1`,
        [assetId, context.tenantId],
      );
      const asset = result.rows[0];
      if (!asset) throw new PromptApiError(404, "PROMPT_MEDIA_NOT_FOUND", "未找到可访问的提示词媒体");
      const signed = await this.storageProvider!.createPresignedGetUrl({
        bucket: asset.bucket,
        expiresInSeconds: 900,
        key: asset.object_key,
        responseContentType: asset.mime_type,
      });
      return { expiresAt: signed.expiresAt, method: "GET" as const, url: signed.url };
    }, true, this.pool);
  }

  async listPrompts(context: PromptContext, query: PromptListQuery): Promise<PromptListView> {
    const offset = Math.max(0, Number.parseInt(query.cursor ?? "0", 10) || 0);
    const params: unknown[] = [context.tenantId, context.userId];
    const where: string[] = [
      "p.status = 'published'",
      "(p.tenant_id IS NULL OR p.tenant_id = $3::uuid)",
    ];
    params.push(context.tenantId);

    if (query.category) {
      params.push(query.category);
      where.push(`p.category = $${params.length}`);
    }

    if (query.query) {
      params.push(`%${query.query}%`);
      const index = params.length;
      where.push(`(
        p.title ILIKE $${index}
        OR p.description ILIKE $${index}
        OR p.prompt_text ILIKE $${index}
        OR EXISTS (SELECT 1 FROM unnest(p.tags) tag WHERE tag ILIKE $${index})
      )`);
    }

    if (query.view === "favorites") {
      where.push(`EXISTS (
        SELECT 1
        FROM prompt_favorites favorite_view
        WHERE favorite_view.prompt_id = p.id
          AND favorite_view.tenant_id = $1::uuid
          AND favorite_view.user_id = $2::uuid
      )`);
    }

    params.push(query.limit + 1, offset);
    const orderBy = query.view === "latest"
      ? "p.updated_at DESC, p.id DESC"
      : "p.sort_weight DESC, p.updated_at DESC, p.id DESC";
    const result = await withPromptTransaction(context, (client) => client.query<PromptRecord>(
      `${promptSelectSql()}
       WHERE ${where.join(" AND ")}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params,
    ), false, this.pool);

    const hasNext = result.rows.length > query.limit;
    return {
      items: result.rows.slice(0, query.limit).map(mapPrompt),
      nextCursor: hasNext ? String(offset + query.limit) : null,
    };
  }

  async getPrompt(context: PromptContext, promptId: string, includeUnpublished = false): Promise<PromptView> {
    const params: unknown[] = [context.tenantId, context.userId, promptId];
    const visibility = includeUnpublished
      ? "(p.tenant_id IS NULL OR p.tenant_id = $1::uuid)"
      : "p.status = 'published' AND (p.tenant_id IS NULL OR p.tenant_id = $1::uuid)";
    const result = await withPromptTransaction(context, (client) => client.query<PromptRecord>(
      `${promptSelectSql()}
       WHERE p.id = $3::uuid
         AND ${visibility}
       LIMIT 1`,
      params,
    ), includeUnpublished, this.pool);
    const row = result.rows[0];
    if (!row) {
      throw new PromptApiError(404, "PROMPT_NOT_FOUND", "未找到对应提示词");
    }
    return mapPrompt(row);
  }

  async setFavorite(context: PromptContext, promptId: string, favorite: boolean): Promise<{ isFavorite: boolean }> {
    await this.getPrompt(context, promptId);
    await withPromptTransaction(context, async (client) => {
      if (favorite) {
        await client.query(
          `INSERT INTO prompt_favorites (tenant_id, user_id, prompt_id)
           VALUES ($1::uuid, $2::uuid, $3::uuid)
           ON CONFLICT (tenant_id, user_id, prompt_id) DO NOTHING`,
          [context.tenantId, context.userId, promptId],
        );
      } else {
        await client.query(
          `DELETE FROM prompt_favorites
           WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND prompt_id = $3::uuid`,
          [context.tenantId, context.userId, promptId],
        );
      }
    }, false, this.pool);
    return { isFavorite: favorite };
  }

  async recordInteraction(
    context: PromptContext,
    promptId: string,
    input: PromptInteractionInput,
  ): Promise<{ ok: true }> {
    await this.getPrompt(context, promptId);
    if (input.projectId) {
      const project = await withPromptTransaction(context, (client) => client.query<{ id: string }>(
        `SELECT id::text AS id
         FROM projects
         WHERE id = $1::uuid AND tenant_id = $2::uuid AND deleted_at IS NULL
         LIMIT 1`,
        [input.projectId, context.tenantId],
      ), false, this.pool);
      if (!project.rows[0]) {
        throw new PromptApiError(404, "PROJECT_NOT_FOUND", "未找到对应项目");
      }
    }
    await withPromptTransaction(context, (client) => client.query(
      `INSERT INTO prompt_interactions (tenant_id, user_id, prompt_id, event_type, project_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid)`,
      [context.tenantId, context.userId, promptId, input.eventType, input.projectId ?? null],
    ), false, this.pool);
    return { ok: true };
  }

  async listAdminPrompts(context: PromptContext): Promise<PromptView[]> {
    const result = await withPromptTransaction(context, (client) => client.query<PromptRecord>(
      `${promptSelectSql()}
       WHERE p.tenant_id IS NULL OR p.tenant_id = $1::uuid
       ORDER BY p.status ASC, p.sort_weight DESC, p.updated_at DESC, p.id DESC`,
      [context.tenantId, context.userId],
    ), true, this.pool);
    return result.rows.map(mapPrompt);
  }

  async createAdminPrompt(context: PromptContext, input: PromptAdminInput): Promise<PromptView> {
    const result = await withPromptTransaction(context, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO prompt_entries (
          tenant_id, created_by, external_key, title, description, prompt_text,
          negative_prompt, category, tags, status, sort_weight, published_at
        ) VALUES (
          NULL, $1::uuid, $2, $3, $4, $5, $6, $7, $8::text[], $9,
          $10, CASE WHEN $9 = 'published' THEN now() ELSE NULL END
        ) RETURNING id::text AS id`,
        [
          context.userId,
          input.externalKey,
          input.title,
          input.description,
          input.promptText,
          input.negativePrompt ?? null,
          input.category,
          input.tags,
          input.status,
          input.sortWeight,
        ],
      );
      return inserted.rows[0];
    }, true, this.pool);
    return this.getPrompt(context, result.id, true);
  }

  async updateAdminPrompt(context: PromptContext, promptId: string, input: PromptAdminInput): Promise<PromptView> {
    await withPromptTransaction(context, async (client) => {
      const result = await client.query(
        `UPDATE prompt_entries
         SET external_key = $2,
             title = $3,
             description = $4,
             prompt_text = $5,
             negative_prompt = $6,
             category = $7,
             tags = $8::text[],
             status = $9,
             sort_weight = $10,
             version = version + 1,
             published_at = CASE WHEN $9 = 'published' THEN COALESCE(published_at, now()) ELSE NULL END,
             updated_at = now()
         WHERE id = $1::uuid
         RETURNING id`,
        [
          promptId,
          input.externalKey,
          input.title,
          input.description,
          input.promptText,
          input.negativePrompt ?? null,
          input.category,
          input.tags,
          input.status,
          input.sortWeight,
        ],
      );
      if (!result.rows[0]) {
        throw new PromptApiError(404, "PROMPT_NOT_FOUND", "未找到对应提示词");
      }
    }, true, this.pool);
    return this.getPrompt(context, promptId, true);
  }

  async setAdminStatus(
    context: PromptContext,
    promptId: string,
    status: "archived" | "draft" | "published",
  ): Promise<PromptView> {
    await withPromptTransaction(context, async (client) => {
      const result = await client.query(
        `UPDATE prompt_entries
         SET status = $2,
             published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, now()) ELSE NULL END,
             version = version + 1,
             updated_at = now()
         WHERE id = $1::uuid
         RETURNING id`,
        [promptId, status],
      );
      if (!result.rows[0]) {
        throw new PromptApiError(404, "PROMPT_NOT_FOUND", "未找到对应提示词");
      }
    }, true, this.pool);
    return this.getPrompt(context, promptId, true);
  }

  validateImport(input: PromptImportInput): { errors: Array<{ index: number; message: string }>; rows: PromptImportInput["rows"] } {
    const errors: Array<{ index: number; message: string }> = [];
    const seen = new Set<string>();
    const rows = input.rows.flatMap((row, index) => {
      const parsed = promptImportRowSchema.safeParse(row);
      if (!parsed.success) {
        errors.push({ index, message: parsed.error.issues.map((issue) => issue.message).join("；") });
        return [];
      }
      if (seen.has(parsed.data.externalKey)) {
        errors.push({ index, message: `externalKey 重复：${parsed.data.externalKey}` });
        return [];
      }
      seen.add(parsed.data.externalKey);
      return [parsed.data];
    });
    return { errors, rows };
  }

  async importAdminPrompts(context: PromptContext, input: PromptImportInput): Promise<{ created: number; errors: Array<{ index: number; message: string }> }> {
    const validation = this.validateImport(input);
    if (validation.errors.length > 0) return { created: 0, errors: validation.errors };
    await withPromptTransaction(context, async (client) => {
      for (const row of validation.rows) {
        await client.query(
          `INSERT INTO prompt_entries (
            tenant_id, created_by, external_key, title, description, prompt_text,
            negative_prompt, category, tags, status
          ) VALUES (NULL, $1::uuid, $2, $3, $4, $5, $6, $7, $8::text[], 'draft')
          ON CONFLICT (external_key) WHERE tenant_id IS NULL
          DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            prompt_text = EXCLUDED.prompt_text,
            negative_prompt = EXCLUDED.negative_prompt,
            category = EXCLUDED.category,
            tags = EXCLUDED.tags,
            version = prompt_entries.version + 1,
            updated_at = now()`,
          [
            context.userId,
            row.externalKey,
            row.title,
            row.description ?? "",
            row.promptText,
            row.negativePrompt ?? null,
            row.category,
            row.tags ?? [],
          ],
        );
      }
    }, true, this.pool);
    return { created: validation.rows.length, errors: [] };
  }
}

export const __promptsServiceTestUtils = {
  mapPrompt,
};
