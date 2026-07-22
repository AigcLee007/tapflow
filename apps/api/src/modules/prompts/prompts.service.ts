import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import type { Pool, PoolClient } from "pg";
import sharp from "sharp";

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
  height: number | null;
  id: string;
  mime_type: string | null;
  original_filename: string | null;
  size_bytes: string | null;
  sort_order: number;
  storage_key: string | null;
  preview_storage_key: string | null;
  thumbnail_storage_key: string | null;
  width: number | null;
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
  prompt_text_en: string | null;
  prompt_text_zh: string | null;
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
  height: number | null;
  id: string;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number | null;
  sortOrder: number;
  width: number | null;
};

export type PromptMediaUploadInput = {
  altText?: string;
  body: Buffer;
  height?: number | null;
  mimeType: string;
  originalFilename: string;
  width?: number | null;
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
  promptTextEn: string | null;
  promptTextZh: string | null;
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
    media: Array.isArray(row.media) ? row.media.map(mapPromptMedia) : [],
    negativePrompt: row.negative_prompt,
    promptText: row.prompt_text_en || row.prompt_text_zh || row.prompt_text,
    promptTextEn: row.prompt_text_en,
    promptTextZh: row.prompt_text_zh,
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

function mapPromptMedia(item: PromptMediaRecord): PromptMediaView {
  return {
    altText: item.alt_text,
    height: item.height,
    id: item.id,
    mimeType: item.mime_type ?? "application/octet-stream",
    originalFilename: item.original_filename ?? "prompt-media",
    sizeBytes: item.size_bytes === null ? null : Number(item.size_bytes),
    sortOrder: item.sort_order,
    width: item.width,
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
      p.prompt_text_en,
      p.prompt_text_zh,
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
            'id', media.id::text,
            'sort_order', media.sort_order,
            'alt_text', media.alt_text,
            'original_filename', media.original_filename,
            'mime_type', media.mime_type,
            'size_bytes', media.size_bytes::text,
            'width', media.width,
            'height', media.height
          ) ORDER BY media.sort_order ASC, media.id ASC
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
  readonly idFactory: () => string;
  readonly pool: PgPool;
  readonly promptCatalogMediaDir: string;

  constructor(options?: { idFactory?: () => string; pool?: PgPool; promptCatalogMediaDir?: string }) {
    this.idFactory = options?.idFactory ?? randomUUID;
    this.pool = options?.pool ?? createPgPool();
    this.promptCatalogMediaDir = resolve(options?.promptCatalogMediaDir ?? "./data/prompt-catalog");
  }

  async uploadLocalMedia(context: PromptContext, promptId: string, input: PromptMediaUploadInput): Promise<PromptMediaView> {
    if (!input.mimeType.startsWith("image/") || !["image/jpeg", "image/png", "image/webp"].includes(input.mimeType)) {
      throw new PromptApiError(400, "PROMPT_MEDIA_TYPE_INVALID", "仅支持 JPG、PNG 和 WebP 效果图");
    }
    if (input.body.byteLength === 0 || input.body.byteLength > 10 * 1024 * 1024) {
      throw new PromptApiError(400, "PROMPT_MEDIA_SIZE_INVALID", "效果图大小必须在 10 MB 以内");
    }
    await this.getPrompt(context, promptId, true);
    const mediaId = this.idFactory();
    const extension = extname(input.originalFilename).toLowerCase() || (input.mimeType === "image/png" ? ".png" : input.mimeType === "image/webp" ? ".webp" : ".jpg");
    const storageKey = `${promptId}/${mediaId}${extension}`;
    const absolutePath = this.resolveLocalMediaPath(storageKey);
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, input.body, { flag: "wx" });
    const thumbnailStorageKey = `${promptId}/${mediaId}.thumb.webp`;
    const previewStorageKey = `${promptId}/${mediaId}.preview.webp`;
    const generatedKeys: string[] = [];
    try {
      const thumbnailBody = await sharp(input.body).rotate().resize({ fit: "inside", width: 640, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      await writeFile(this.resolveLocalMediaPath(thumbnailStorageKey), thumbnailBody, { flag: "wx" });
      generatedKeys.push(thumbnailStorageKey);
      const previewBody = await sharp(input.body).rotate().resize({ fit: "inside", width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      await writeFile(this.resolveLocalMediaPath(previewStorageKey), previewBody, { flag: "wx" });
      generatedKeys.push(previewStorageKey);
    } catch (error) {
      console.warn("prompt media variant generation failed", { error, mediaId });
    }
    try {
      return await withPromptTransaction(context, async (client) => {
        const count = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM prompt_entry_media WHERE prompt_id = $1::uuid`, [promptId]);
        if (Number(count.rows[0]?.count ?? 0) >= 4) throw new PromptApiError(400, "PROMPT_MEDIA_LIMIT_REACHED", "每条提示词最多上传 4 张效果图");
        const result = await client.query<PromptMediaRecord>(
          `INSERT INTO prompt_entry_media (id, prompt_id, asset_id, storage_key, thumbnail_storage_key, preview_storage_key, original_filename, mime_type, size_bytes, width, height, sort_order, alt_text)
           VALUES ($1::uuid, $2::uuid, NULL, $3, $4, $5, $6, $7, $8::bigint, $9::int, $10::int,
             (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM prompt_entry_media WHERE prompt_id = $2::uuid), $11)
           RETURNING id::text AS id, alt_text, sort_order, original_filename, mime_type, size_bytes::text AS size_bytes, width, height, storage_key, thumbnail_storage_key, preview_storage_key`,
          [mediaId, promptId, storageKey, generatedKeys.includes(thumbnailStorageKey) ? thumbnailStorageKey : null, generatedKeys.includes(previewStorageKey) ? previewStorageKey : null, input.originalFilename, input.mimeType, input.body.byteLength, input.width ?? null, input.height ?? null, input.altText?.trim() ?? ""],
        );
        return mapPromptMedia(result.rows[0]!);
      }, true, this.pool);
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      await Promise.all(generatedKeys.map((key) => unlink(this.resolveLocalMediaPath(key)).catch(() => undefined)));
      throw error;
    }
  }

  async listLocalMedia(context: PromptContext, promptId: string): Promise<PromptMediaView[]> {
    const result = await withPromptTransaction(context, (client) => client.query<PromptMediaRecord>(
      `SELECT id::text AS id, alt_text, sort_order, original_filename, mime_type, size_bytes::text AS size_bytes, width, height, storage_key
       FROM prompt_entry_media WHERE prompt_id = $1::uuid AND storage_key IS NOT NULL ORDER BY sort_order ASC, id ASC`, [promptId]), true, this.pool);
    return result.rows.map(mapPromptMedia);
  }

  async updateLocalMediaOrder(context: PromptContext, promptId: string, media: Array<{ altText?: string; id: string; sortOrder: number }>): Promise<PromptMediaView[]> {
    await withPromptTransaction(context, async (client) => {
      const result = await client.query<{ id: string }>(`SELECT id::text AS id FROM prompt_entry_media WHERE prompt_id = $1::uuid AND storage_key IS NOT NULL`, [promptId]);
      const existing = new Set(result.rows.map((item) => item.id));
      if (media.length !== existing.size || media.some((item) => !existing.has(item.id))) throw new PromptApiError(400, "PROMPT_MEDIA_INVALID", "效果图排序数据无效");
      for (const item of media) await client.query(`UPDATE prompt_entry_media SET sort_order = $3::int, alt_text = $4 WHERE id = $1::uuid AND prompt_id = $2::uuid`, [item.id, promptId, item.sortOrder, item.altText?.trim() ?? ""]);
    }, true, this.pool);
    return this.listLocalMedia(context, promptId);
  }

  async deleteLocalMedia(context: PromptContext, promptId: string, mediaId: string): Promise<{ ok: true }> {
    const result = await withPromptTransaction(context, async (client) => client.query<{ preview_storage_key: string | null; storage_key: string | null; thumbnail_storage_key: string | null }>(
      `DELETE FROM prompt_entry_media WHERE id = $1::uuid AND prompt_id = $2::uuid RETURNING storage_key, thumbnail_storage_key, preview_storage_key`, [mediaId, promptId]), true, this.pool);
    const media = result.rows[0];
    if (!media?.storage_key) throw new PromptApiError(404, "PROMPT_MEDIA_NOT_FOUND", "未找到效果图");
    await unlink(this.resolveLocalMediaPath(media.storage_key)).catch(() => undefined);
    await Promise.all([media.thumbnail_storage_key, media.preview_storage_key].filter((key): key is string => Boolean(key)).map((key) => unlink(this.resolveLocalMediaPath(key)).catch(() => undefined)));
    return { ok: true };
  }

  async getLocalMediaBytes(context: PromptContext, mediaId: string, promptId?: string, variant: "original" | "preview" | "thumb" = "original"): Promise<{ body: Buffer; etag: string; mimeType: string }> {
    const result = await withPromptTransaction(context, (client) => client.query<{ mime_type: string; preview_storage_key: string | null; storage_key: string; thumbnail_storage_key: string | null; version: number }>(
      `SELECT media.mime_type, media.storage_key, media.thumbnail_storage_key, media.preview_storage_key, prompt.version
       FROM prompt_entry_media media JOIN prompt_entries prompt ON prompt.id = media.prompt_id
       WHERE media.id = $1::uuid AND media.storage_key IS NOT NULL
         AND (${promptId ? "prompt.id = $2::uuid" : "prompt.status = 'published' AND (prompt.tenant_id IS NULL OR prompt.tenant_id = $2::uuid)"})
       LIMIT 1`, promptId ? [mediaId, promptId] : [mediaId, context.tenantId]), Boolean(promptId), this.pool);
    const media = result.rows[0];
    if (!media) throw new PromptApiError(404, "PROMPT_MEDIA_NOT_FOUND", "未找到效果图");
    const selectedKey = variant === "thumb" ? media.thumbnail_storage_key : variant === "preview" ? media.preview_storage_key : media.storage_key;
    const storageKey = selectedKey || media.storage_key;
    try { return { body: await readFile(this.resolveLocalMediaPath(storageKey)), etag: `\"${mediaId}-${variant}-${media.version}\"`, mimeType: selectedKey && variant !== "original" ? "image/webp" : media.mime_type }; }
    catch { throw new PromptApiError(404, "PROMPT_MEDIA_FILE_NOT_FOUND", "效果图文件不存在"); }
  }

  private resolveLocalMediaPath(storageKey: string): string {
    const path = resolve(this.promptCatalogMediaDir, storageKey);
    if (relative(this.promptCatalogMediaDir, path).startsWith("..")) throw new PromptApiError(400, "PROMPT_MEDIA_PATH_INVALID", "效果图路径无效");
    return path;
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
        OR p.prompt_text_zh ILIKE $${index}
        OR p.prompt_text_en ILIKE $${index}
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
       ORDER BY p.sort_weight DESC, p.updated_at DESC, p.id DESC`,
      [context.tenantId, context.userId],
    ), true, this.pool);
    return result.rows.map(mapPrompt);
  }

  async createAdminPrompt(context: PromptContext, input: PromptAdminInput): Promise<PromptView> {
    if (input.status === "published") throw new PromptApiError(400, "PROMPT_MEDIA_REQUIRED", "请先保存草稿并上传至少一张效果图后再发布");
    const result = await withPromptTransaction(context, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO prompt_entries (
          tenant_id, created_by, external_key, title, description, prompt_text, prompt_text_zh, prompt_text_en,
          negative_prompt, category, tags, status, sort_weight, published_at
        ) VALUES (
          NULL, $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11,
          $12, CASE WHEN $11 = 'published' THEN now() ELSE NULL END
        ) RETURNING id::text AS id`,
        [
          context.userId,
          input.externalKey,
          input.title,
          input.description,
          input.promptTextEn || input.promptTextZh || "",
          input.promptTextZh || null,
          input.promptTextEn || null,
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
    if (input.status === "published") await this.ensurePromptHasLocalMedia(context, promptId);
    await withPromptTransaction(context, async (client) => {
      const result = await client.query(
        `UPDATE prompt_entries
         SET external_key = $2,
             title = $3,
             description = $4,
             prompt_text = $5,
             prompt_text_zh = $6,
             prompt_text_en = $7,
             negative_prompt = $8,
             category = $9,
             tags = $10::text[],
             status = $11,
             sort_weight = $12,
             version = version + 1,
             published_at = CASE WHEN $11 = 'published' THEN COALESCE(published_at, now()) ELSE NULL END,
             updated_at = now()
         WHERE id = $1::uuid
         RETURNING id`,
        [
          promptId,
          input.externalKey,
          input.title,
          input.description,
          input.promptTextEn || input.promptTextZh || "",
          input.promptTextZh || null,
          input.promptTextEn || null,
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
    if (status === "published") await this.ensurePromptHasLocalMedia(context, promptId);
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

  async deleteAdminPrompt(context: PromptContext, promptId: string): Promise<{ ok: true }> {
    const result = await withPromptTransaction(context, async (client) => {
      const prompt = await client.query<{ status: PromptRecord["status"] }>(
        `SELECT status FROM prompt_entries WHERE id = $1::uuid LIMIT 1`, [promptId],
      );
      if (!prompt.rows[0]) throw new PromptApiError(404, "PROMPT_NOT_FOUND", "未找到对应提示词");
      if (prompt.rows[0].status === "published") {
        throw new PromptApiError(409, "PROMPT_DELETE_REQUIRES_ARCHIVE", "已发布提示词需先下架或归档后才能删除");
      }
      const media = await client.query<{ preview_storage_key: string | null; storage_key: string | null; thumbnail_storage_key: string | null }>(
        `SELECT storage_key, thumbnail_storage_key, preview_storage_key FROM prompt_entry_media WHERE prompt_id = $1::uuid`, [promptId],
      );
      await client.query(`DELETE FROM prompt_entries WHERE id = $1::uuid`, [promptId]);
      return media.rows;
    }, true, this.pool);
    const keys = result.flatMap((item) => [item.storage_key, item.thumbnail_storage_key, item.preview_storage_key]).filter((key): key is string => Boolean(key));
    await Promise.all(keys.map((key) => unlink(this.resolveLocalMediaPath(key)).catch((error) => console.warn("prompt media cleanup failed", { error, key }))));
    return { ok: true };
  }

  async reorderAdminPrompts(context: PromptContext, promptIds: string[]): Promise<PromptView[]> {
    await withPromptTransaction(context, async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM prompt_entries WHERE tenant_id IS NULL OR tenant_id = $1::uuid`, [context.tenantId],
      );
      const existing = new Set(result.rows.map((row) => row.id));
      if (existing.size !== promptIds.length || new Set(promptIds).size !== promptIds.length || promptIds.some((id) => !existing.has(id))) {
        throw new PromptApiError(400, "PROMPT_ORDER_INVALID", "提示词排序数据无效，请刷新后重试");
      }
      for (const [index, id] of promptIds.entries()) {
        await client.query(`UPDATE prompt_entries SET sort_weight = $2::int, updated_at = now() WHERE id = $1::uuid`, [id, (promptIds.length - index) * 1000]);
      }
    }, true, this.pool);
    return this.listAdminPrompts(context);
  }

  private async ensurePromptHasLocalMedia(context: PromptContext, promptId: string): Promise<void> {
    const result = await withPromptTransaction(context, (client) => client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM prompt_entry_media WHERE prompt_id = $1::uuid AND storage_key IS NOT NULL`, [promptId]), true, this.pool);
    if (Number(result.rows[0]?.count ?? 0) < 1) throw new PromptApiError(400, "PROMPT_MEDIA_REQUIRED", "发布前请至少上传一张效果图");
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
            tenant_id, created_by, external_key, title, description, prompt_text, prompt_text_zh, prompt_text_en,
            negative_prompt, category, tags, status
          ) VALUES (NULL, $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], 'draft')
          ON CONFLICT (external_key) WHERE tenant_id IS NULL
          DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            prompt_text = EXCLUDED.prompt_text,
            prompt_text_zh = EXCLUDED.prompt_text_zh,
            prompt_text_en = EXCLUDED.prompt_text_en,
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
            row.promptTextEn || row.promptTextZh || "",
            row.promptTextZh || null,
            row.promptTextEn || null,
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
