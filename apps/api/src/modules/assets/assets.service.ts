import { randomUUID } from "node:crypto";

import { createPgPool, safeRecordAuditLog, withTenantTransaction } from "@aigc-flow/db";
import {
  buildAssetObjectKey,
  type StorageProvider,
} from "@aigc-flow/storage";
import type { Pool, PoolClient } from "pg";

import type {
  AssetListQuery,
  CompleteUploadInput,
  CreateAssetFolderInput,
  PresignedUploadInput,
  UpdateAssetFolderInput,
  UpdateAssetMetadataInput,
} from "./assets.schemas.js";

type PgPool = Pool;

type AssetContext = {
  ipHash?: string | null;
  requestId?: string | null;
  tenantId: string;
  traceId?: string | null;
  userAgent?: string | null;
  userId: string | null;
};

type AssetRecord = {
  bucket: string;
  checksum_sha256: string | null;
  created_at: string;
  deleted_at: string | null;
  description: string | null;
  duration_ms: number | null;
  favorite: boolean;
  height: number | null;
  id: string;
  kind: string;
  metadata: Record<string, string>;
  mime_type: string;
  object_key: string;
  original_filename: string | null;
  owner_user_id: string | null;
  project_id: string | null;
  size_bytes: string | null;
  source: string;
  status: string;
  storage_provider: string;
  tags: string[];
  tenant_id: string;
  title: string | null;
  updated_at: string;
  width: number | null;
};

type AssetVariantRecord = {
  bucket: string;
  height: number | null;
  id: string;
  metadata: Record<string, string>;
  mime_type: string;
  object_key: string;
  size_bytes: string | null;
  variant_key: string;
  width: number | null;
};

export type AssetVariantView = {
  bucket: string;
  height: number | null;
  id: string;
  metadata: Record<string, string>;
  mimeType: string;
  objectKey: string;
  sizeBytes: number | null;
  variantKey: string;
  width: number | null;
};

export type AssetView = {
  bucket: string;
  checksumSha256: string | null;
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  durationMs: number | null;
  favorite: boolean;
  height: number | null;
  id: string;
  kind: string;
  metadata: Record<string, string>;
  mimeType: string;
  objectKey: string;
  originalFilename: string | null;
  ownerUserId: string | null;
  projectId: string | null;
  sizeBytes: number | null;
  source: string;
  status: string;
  storageProvider: string;
  tags: string[];
  tenantId: string;
  title: string | null;
  updatedAt: string;
  variants: AssetVariantView[];
  width: number | null;
};

type AssetForStorage = {
  bucket: string;
  id: string;
  mimeType: string;
  objectKey: string;
  originalFilename: string | null;
  status: string;
};

type AssetFolderRecord = {
  created_at: string;
  created_by: string | null;
  deleted_at: string | null;
  description: string | null;
  id: string;
  name: string;
  parent_folder_id: string | null;
  tenant_id: string;
  updated_at: string;
};

export type AssetFolderView = {
  createdAt: string;
  createdBy: string | null;
  deletedAt: string | null;
  description: string | null;
  id: string;
  name: string;
  parentFolderId: string | null;
  tenantId: string;
  updatedAt: string;
};

export class AssetsApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AssetsApiError";
    this.statusCode = statusCode;
  }
}

function toNumberOrNull(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapVariant(row: AssetVariantRecord): AssetVariantView {
  return {
    bucket: row.bucket,
    height: row.height,
    id: row.id,
    metadata: row.metadata ?? {},
    mimeType: row.mime_type,
    objectKey: row.object_key,
    sizeBytes: toNumberOrNull(row.size_bytes),
    variantKey: row.variant_key,
    width: row.width,
  };
}

function mapAsset(row: AssetRecord, variants: AssetVariantView[]): AssetView {
  return {
    bucket: row.bucket,
    checksumSha256: row.checksum_sha256,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    description: row.description,
    durationMs: row.duration_ms,
    favorite: row.favorite,
    height: row.height,
    id: row.id,
    kind: row.kind,
    metadata: row.metadata ?? {},
    mimeType: row.mime_type,
    objectKey: row.object_key,
    originalFilename: row.original_filename,
    ownerUserId: row.owner_user_id,
    projectId: row.project_id,
    sizeBytes: toNumberOrNull(row.size_bytes),
    source: row.source,
    status: row.status,
    storageProvider: row.storage_provider,
    tags: row.tags ?? [],
    tenantId: row.tenant_id,
    title: row.title,
    updatedAt: row.updated_at,
    variants,
    width: row.width,
  };
}

function mapFolder(row: AssetFolderRecord): AssetFolderView {
  return {
    createdAt: row.created_at,
    createdBy: row.created_by,
    deletedAt: row.deleted_at,
    description: row.description,
    id: row.id,
    name: row.name,
    parentFolderId: row.parent_folder_id,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
  };
}

function buildDownloadFilename(asset: AssetForStorage): string {
  return asset.originalFilename?.trim() || `asset-${asset.id}`;
}

export class AssetsService {
  readonly bucket: string;
  readonly pool: PgPool;
  readonly storageProvider: StorageProvider;

  constructor(options: {
    bucket: string;
    pool?: PgPool;
    storageProvider: StorageProvider;
  }) {
    this.bucket = options.bucket;
    this.pool = options.pool ?? createPgPool();
    this.storageProvider = options.storageProvider;
  }

  async listAssets(
    context: AssetContext,
    query: AssetListQuery,
  ): Promise<{
    items: AssetView[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    return withTenantTransaction(context, async (client) => {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 40;
      const where = ["a.deleted_at IS NULL"];
      const values: unknown[] = [];

      const add = (value: unknown) => {
        values.push(value);
        return `$${values.length}`;
      };

      where.push(`a.tenant_id = ${add(context.tenantId)}::uuid`);

      if (query.projectId) {
        where.push(`a.project_id = ${add(query.projectId)}::uuid`);
      }
      if (query.kind) {
        where.push(`a.kind = ${add(query.kind.trim())}`);
      }
      if (query.source) {
        where.push(`a.source = ${add(query.source.trim())}`);
      }
      if (query.favorite !== undefined) {
        where.push(`a.favorite = ${add(query.favorite)}::boolean`);
      }
      if (query.query) {
        const term = `%${query.query.trim()}%`;
        where.push(`(
          a.title ILIKE ${add(term)}
          OR a.original_filename ILIKE ${add(term)}
          OR a.description ILIKE ${add(term)}
        )`);
      }
      if (query.folderId) {
        await this.ensureFolderExists(client, context.tenantId, query.folderId);
        where.push(`EXISTS (
          SELECT 1
          FROM asset_folder_items afi
          JOIN asset_folders af ON af.id = afi.folder_id
          WHERE afi.asset_id = a.id
            AND afi.folder_id = ${add(query.folderId)}::uuid
            AND afi.tenant_id = ${add(context.tenantId)}::uuid
            AND af.deleted_at IS NULL
            AND af.tenant_id = ${add(context.tenantId)}::uuid
        )`);
      }

      const whereSql = where.join(" AND ");
      const total = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM assets a WHERE ${whereSql}`,
        values,
      );

      const pageValues = [...values, pageSize, (page - 1) * pageSize];
      const result = await client.query<AssetRecord>(
        `
          SELECT
            a.id::text AS id,
            a.tenant_id::text AS tenant_id,
            a.project_id::text AS project_id,
            a.owner_user_id::text AS owner_user_id,
            a.kind,
            a.mime_type,
            a.storage_provider,
            a.bucket,
            a.object_key,
            a.original_filename,
            a.size_bytes::text AS size_bytes,
            a.checksum_sha256,
            a.width,
            a.height,
            a.duration_ms,
            a.metadata,
            a.status,
            a.title,
            a.description,
            a.tags,
            a.source,
            a.favorite,
            a.created_at::text AS created_at,
            a.updated_at::text AS updated_at,
            a.deleted_at::text AS deleted_at
          FROM assets a
          WHERE ${whereSql}
          ORDER BY a.updated_at DESC, a.created_at DESC, a.id DESC
          LIMIT $${values.length + 1}
          OFFSET $${values.length + 2}
        `,
        pageValues,
      );

      const items: AssetView[] = [];
      for (const row of result.rows) {
        items.push(mapAsset(row, await this.listVariants(client, row.id)));
      }

      return {
        items,
        page,
        pageSize,
        total: total.rows[0]?.total ?? 0,
      };
    }, this.pool);
  }

  async createPresignedUpload(
    context: AssetContext,
    input: PresignedUploadInput,
  ): Promise<{
    asset: AssetView;
    upload: {
      expiresAt: string;
      headers: Record<string, string>;
      method: "PUT";
      url: string;
    };
  }> {
    const assetId = randomUUID();

    return withTenantTransaction(context, async (client) => {
      if (input.projectId) {
        const project = await client.query<{ id: string }>(
          `
            SELECT id::text AS id
            FROM projects
            WHERE id = $1::uuid
              AND tenant_id = $2::uuid
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [input.projectId, context.tenantId],
        );

        if (!project.rows[0]) {
          throw new AssetsApiError(404, "PROJECT_NOT_FOUND", "Project not found");
        }
      }

      const objectKey = buildAssetObjectKey({
        assetId,
        filename: input.originalFilename,
        tenantId: context.tenantId,
      });

      const created = await client.query<AssetRecord>(
        `
          INSERT INTO assets (
            id,
            tenant_id,
            project_id,
            owner_user_id,
            kind,
            mime_type,
            bucket,
            object_key,
            original_filename,
            size_bytes,
            checksum_sha256,
            width,
            height,
            duration_ms,
            metadata,
            status
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::uuid,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10::bigint,
            $11,
            $12::int,
            $13::int,
            $14::int,
            $15::jsonb,
            'uploading'
          )
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            project_id::text AS project_id,
            owner_user_id::text AS owner_user_id,
            kind,
            mime_type,
            storage_provider,
            bucket,
            object_key,
            original_filename,
            size_bytes::text AS size_bytes,
            checksum_sha256,
            width,
            height,
            duration_ms,
            metadata,
            status,
            title,
            description,
            tags,
            source,
            favorite,
            created_at::text AS created_at,
            updated_at::text AS updated_at,
            deleted_at::text AS deleted_at
        `,
        [
          assetId,
          context.tenantId,
          input.projectId ?? null,
          context.userId,
          input.kind.trim(),
          input.mimeType.trim(),
          this.bucket,
          objectKey,
          input.originalFilename.trim(),
          input.sizeBytes ?? null,
          input.checksumSha256?.trim() ?? null,
          input.width ?? null,
          input.height ?? null,
          input.durationMs ?? null,
          JSON.stringify(input.metadata ?? {}),
        ],
      );

      const upload = await this.storageProvider.createPresignedPutUrl({
        bucket: this.bucket,
        contentLength: input.sizeBytes ?? null,
        contentType: input.mimeType,
        expiresInSeconds: 900,
        key: objectKey,
      });

      const response = {
        asset: mapAsset(created.rows[0], []),
        upload: {
          expiresAt: upload.expiresAt,
          headers: upload.headers,
          method: "PUT" as const,
          url: upload.url,
        },
      };

      await safeRecordAuditLog(
        {
          action: "asset.presigned_upload.create",
          actorType: context.userId ? "user" : "system",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            kind: response.asset.kind,
            mimeType: response.asset.mimeType,
            projectId: response.asset.projectId,
            status: response.asset.status,
          },
          requestId: context.requestId,
          resourceId: response.asset.id,
          resourceType: "asset",
          tenantId: context.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        {
          pool: this.pool,
        },
      );

      return response;
    }, this.pool);
  }

  async completeUpload(
    context: AssetContext,
    assetId: string,
    input: CompleteUploadInput,
  ): Promise<AssetView> {
    return withTenantTransaction(context, async (client) => {
      const asset = await this.getAssetRowForUpdate(client, context.tenantId, assetId);
      if (asset.deleted_at) {
        throw new AssetsApiError(404, "ASSET_NOT_FOUND", "Asset not found");
      }

      const head = await this.storageProvider.headObject({
        bucket: asset.bucket,
        key: asset.object_key,
      });

      const updated = await client.query<AssetRecord>(
        `
          UPDATE assets
          SET
            mime_type = COALESCE($2, mime_type),
            size_bytes = COALESCE($3::bigint, size_bytes),
            checksum_sha256 = COALESCE($4, checksum_sha256),
            width = COALESCE($5::int, width),
            height = COALESCE($6::int, height),
            duration_ms = COALESCE($7::int, duration_ms),
            status = 'available',
            updated_at = now()
          WHERE id = $1::uuid
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            project_id::text AS project_id,
            owner_user_id::text AS owner_user_id,
            kind,
            mime_type,
            storage_provider,
            bucket,
            object_key,
            original_filename,
            size_bytes::text AS size_bytes,
            checksum_sha256,
            width,
            height,
            duration_ms,
            metadata,
            status,
            title,
            description,
            tags,
            source,
            favorite,
            created_at::text AS created_at,
            updated_at::text AS updated_at,
            deleted_at::text AS deleted_at
        `,
        [
          assetId,
          head.contentType ?? null,
          input.sizeBytes ?? head.contentLength ?? null,
          input.checksumSha256?.trim() ?? null,
          input.width ?? null,
          input.height ?? null,
          input.durationMs ?? null,
        ],
      );

      const assetView = mapAsset(updated.rows[0], await this.listVariants(client, assetId));
      await safeRecordAuditLog(
        {
          action: "asset.complete_upload",
          actorType: context.userId ? "user" : "system",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            mimeType: assetView.mimeType,
            sizeBytes: assetView.sizeBytes,
            status: assetView.status,
          },
          requestId: context.requestId,
          resourceId: assetView.id,
          resourceType: "asset",
          tenantId: context.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        {
          pool: this.pool,
        },
      );

      return assetView;
    }, this.pool);
  }

  async getAsset(context: AssetContext, assetId: string): Promise<AssetView> {
    return withTenantTransaction(context, async (client) => {
      const asset = await this.getAssetRow(client, context.tenantId, assetId);
      if (asset.deleted_at) {
        throw new AssetsApiError(404, "ASSET_NOT_FOUND", "Asset not found");
      }

      return mapAsset(asset, await this.listVariants(client, assetId));
    }, this.pool);
  }

  async updateAssetMetadata(
    context: AssetContext,
    assetId: string,
    input: UpdateAssetMetadataInput,
  ): Promise<AssetView> {
    return withTenantTransaction(context, async (client) => {
      const asset = await this.getAssetRowForUpdate(client, context.tenantId, assetId);
      if (asset.deleted_at) {
        throw new AssetsApiError(404, "ASSET_NOT_FOUND", "Asset not found");
      }
      const updated = await client.query<AssetRecord>(
        `
          UPDATE assets
          SET
            title = CASE WHEN $2::boolean THEN $3 ELSE title END,
            description = CASE WHEN $4::boolean THEN $5 ELSE description END,
            tags = CASE WHEN $6::boolean THEN $7::text[] ELSE tags END,
            source = COALESCE($8, source),
            favorite = COALESCE($9::boolean, favorite),
            metadata = CASE WHEN $10::boolean THEN $11::jsonb ELSE metadata END,
            updated_at = now()
          WHERE id = $1::uuid
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            project_id::text AS project_id,
            owner_user_id::text AS owner_user_id,
            kind,
            mime_type,
            storage_provider,
            bucket,
            object_key,
            original_filename,
            size_bytes::text AS size_bytes,
            checksum_sha256,
            width,
            height,
            duration_ms,
            metadata,
            status,
            title,
            description,
            tags,
            source,
            favorite,
            created_at::text AS created_at,
            updated_at::text AS updated_at,
            deleted_at::text AS deleted_at
        `,
        [
          assetId,
          input.title !== undefined,
          input.title ?? null,
          input.description !== undefined,
          input.description ?? null,
          input.tags !== undefined,
          input.tags ?? [],
          input.source?.trim() ?? null,
          input.favorite ?? null,
          input.metadata !== undefined,
          JSON.stringify(input.metadata ?? {}),
        ],
      );

      return mapAsset(updated.rows[0], await this.listVariants(client, assetId));
    }, this.pool);
  }

  async listFolders(context: AssetContext): Promise<AssetFolderView[]> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<AssetFolderRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            parent_folder_id::text AS parent_folder_id,
            name,
            description,
            created_by::text AS created_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at,
            deleted_at::text AS deleted_at
          FROM asset_folders
          WHERE tenant_id = $1::uuid
            AND deleted_at IS NULL
          ORDER BY name ASC, created_at ASC
        `,
        [context.tenantId],
      );

      return result.rows.map(mapFolder);
    }, this.pool);
  }

  async createFolder(
    context: AssetContext,
    input: CreateAssetFolderInput,
  ): Promise<AssetFolderView> {
    return withTenantTransaction(context, async (client) => {
      if (input.parentFolderId) {
        await this.ensureFolderExists(client, context.tenantId, input.parentFolderId);
      }

      const result = await client.query<AssetFolderRecord>(
        `
          INSERT INTO asset_folders (
            tenant_id,
            parent_folder_id,
            name,
            description,
            created_by,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, now())
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            parent_folder_id::text AS parent_folder_id,
            name,
            description,
            created_by::text AS created_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at,
            deleted_at::text AS deleted_at
        `,
        [
          context.tenantId,
          input.parentFolderId ?? null,
          input.name.trim(),
          input.description?.trim() ?? null,
          context.userId,
        ],
      );

      return mapFolder(result.rows[0]);
    }, this.pool);
  }

  async updateFolder(
    context: AssetContext,
    folderId: string,
    input: UpdateAssetFolderInput,
  ): Promise<AssetFolderView> {
    return withTenantTransaction(context, async (client) => {
      await this.ensureFolderExists(client, context.tenantId, folderId);
      if (input.parentFolderId) {
        if (input.parentFolderId === folderId) {
          throw new AssetsApiError(400, "INVALID_FOLDER_PARENT", "A folder cannot be its own parent");
        }
        await this.ensureFolderExists(client, context.tenantId, input.parentFolderId);
      }

      const result = await client.query<AssetFolderRecord>(
        `
          UPDATE asset_folders
          SET
            name = COALESCE($2, name),
            description = CASE WHEN $3::boolean THEN $4 ELSE description END,
            parent_folder_id = CASE WHEN $5::boolean THEN $6::uuid ELSE parent_folder_id END,
            updated_at = now()
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
            AND deleted_at IS NULL
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            parent_folder_id::text AS parent_folder_id,
            name,
            description,
            created_by::text AS created_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at,
            deleted_at::text AS deleted_at
        `,
        [
          folderId,
          context.tenantId,
          input.name?.trim() ?? null,
          input.description !== undefined,
          input.description?.trim() ?? null,
          input.parentFolderId !== undefined,
          input.parentFolderId ?? null,
        ],
      );

      return mapFolder(result.rows[0]);
    }, this.pool);
  }

  async deleteFolder(context: AssetContext, folderId: string): Promise<{ ok: true }> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<{ id: string }>(
        `
          UPDATE asset_folders
          SET deleted_at = now(), updated_at = now()
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
            AND deleted_at IS NULL
          RETURNING id::text AS id
        `,
        [folderId, context.tenantId],
      );
      if (!result.rows[0]?.id) {
        throw new AssetsApiError(404, "FOLDER_NOT_FOUND", "Asset folder not found");
      }
      await client.query(
        `
          DELETE FROM asset_folder_items
          WHERE folder_id = $1::uuid
            AND tenant_id = $2::uuid
        `,
        [folderId, context.tenantId],
      );

      return { ok: true as const };
    }, this.pool);
  }

  async addAssetToFolder(
    context: AssetContext,
    folderId: string,
    assetId: string,
  ): Promise<{ ok: true }> {
    return withTenantTransaction(context, async (client) => {
      await this.ensureFolderExists(client, context.tenantId, folderId);
      await this.ensureAssetExists(client, context.tenantId, assetId);

      await client.query(
        `
          INSERT INTO asset_folder_items (tenant_id, folder_id, asset_id, added_by)
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)
          ON CONFLICT (folder_id, asset_id) DO NOTHING
        `,
        [context.tenantId, folderId, assetId, context.userId],
      );

      return { ok: true as const };
    }, this.pool);
  }

  async removeAssetFromFolder(
    context: AssetContext,
    folderId: string,
    assetId: string,
  ): Promise<{ ok: true }> {
    return withTenantTransaction(context, async (client) => {
      await this.ensureFolderExists(client, context.tenantId, folderId);
      await this.ensureAssetExists(client, context.tenantId, assetId);
      await client.query(
        `
          DELETE FROM asset_folder_items
          WHERE folder_id = $1::uuid
            AND asset_id = $2::uuid
            AND tenant_id = $3::uuid
        `,
        [folderId, assetId, context.tenantId],
      );

      return { ok: true as const };
    }, this.pool);
  }

  async createDownloadUrl(
    context: AssetContext,
    assetId: string,
  ): Promise<{
    expiresAt: string;
    method: "GET";
    url: string;
  }> {
    return withTenantTransaction(context, async (client) => {
      const asset = await this.getAssetRow(client, context.tenantId, assetId);
      if (asset.deleted_at) {
        throw new AssetsApiError(404, "ASSET_NOT_FOUND", "Asset not found");
      }
      if (asset.status !== "available") {
        throw new AssetsApiError(409, "ASSET_NOT_AVAILABLE", "Asset is not available");
      }

      const download = await this.storageProvider.createPresignedGetUrl({
        bucket: asset.bucket,
        expiresInSeconds: 900,
        key: asset.object_key,
        responseContentDisposition: `attachment; filename="${buildDownloadFilename({
          bucket: asset.bucket,
          id: asset.id,
          mimeType: asset.mime_type,
          objectKey: asset.object_key,
          originalFilename: asset.original_filename,
          status: asset.status,
        })}"`,
        responseContentType: asset.mime_type,
      });

      return {
        expiresAt: download.expiresAt,
        method: "GET",
        url: download.url,
      };
    }, this.pool);
  }

  async deleteAsset(context: AssetContext, assetId: string): Promise<{ ok: true }> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<{ id: string }>(
        `
          UPDATE assets
          SET deleted_at = now(), updated_at = now()
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
            AND deleted_at IS NULL
          RETURNING id::text AS id
        `,
        [assetId, context.tenantId],
      );

      if (!result.rows[0]?.id) {
        throw new AssetsApiError(404, "ASSET_NOT_FOUND", "Asset not found");
      }

      await safeRecordAuditLog(
        {
          action: "asset.delete",
          actorType: context.userId ? "user" : "system",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            assetId,
          },
          requestId: context.requestId,
          resourceId: assetId,
          resourceType: "asset",
          tenantId: context.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        {
          pool: this.pool,
        },
      );

      return { ok: true as const };
    }, this.pool);
  }

  private async getAssetRow(
    client: PoolClient,
    tenantId: string,
    assetId: string,
  ): Promise<AssetRecord> {
    const result = await client.query<AssetRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          project_id::text AS project_id,
          owner_user_id::text AS owner_user_id,
          kind,
          mime_type,
          storage_provider,
          bucket,
          object_key,
          original_filename,
          size_bytes::text AS size_bytes,
          checksum_sha256,
          width,
          height,
          duration_ms,
          metadata,
          status,
          title,
          description,
          tags,
          source,
          favorite,
          created_at::text AS created_at,
          updated_at::text AS updated_at,
          deleted_at::text AS deleted_at
        FROM assets
        WHERE id = $1::uuid
          AND tenant_id = $2::uuid
        LIMIT 1
      `,
      [assetId, tenantId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new AssetsApiError(404, "ASSET_NOT_FOUND", "Asset not found");
    }

    return row;
  }

  private async getAssetRowForUpdate(
    client: PoolClient,
    tenantId: string,
    assetId: string,
  ): Promise<AssetRecord> {
    const result = await client.query<AssetRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          project_id::text AS project_id,
          owner_user_id::text AS owner_user_id,
          kind,
          mime_type,
          storage_provider,
          bucket,
          object_key,
          original_filename,
          size_bytes::text AS size_bytes,
          checksum_sha256,
          width,
          height,
          duration_ms,
          metadata,
          status,
          title,
          description,
          tags,
          source,
          favorite,
          created_at::text AS created_at,
          updated_at::text AS updated_at,
          deleted_at::text AS deleted_at
        FROM assets
        WHERE id = $1::uuid
          AND tenant_id = $2::uuid
        LIMIT 1
        FOR UPDATE
      `,
      [assetId, tenantId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new AssetsApiError(404, "ASSET_NOT_FOUND", "Asset not found");
    }

    return row;
  }

  private async ensureAssetExists(
    client: PoolClient,
    tenantId: string,
    assetId: string,
  ): Promise<void> {
    const result = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM assets
        WHERE id = $1::uuid
          AND tenant_id = $2::uuid
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [assetId, tenantId],
    );

    if (!result.rows[0]) {
      throw new AssetsApiError(404, "ASSET_NOT_FOUND", "Asset not found");
    }
  }

  private async ensureFolderExists(
    client: PoolClient,
    tenantId: string,
    folderId: string,
  ): Promise<void> {
    const result = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM asset_folders
        WHERE id = $1::uuid
          AND tenant_id = $2::uuid
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [folderId, tenantId],
    );

    if (!result.rows[0]) {
      throw new AssetsApiError(404, "FOLDER_NOT_FOUND", "Asset folder not found");
    }
  }

  private async listVariants(
    client: PoolClient,
    assetId: string,
  ): Promise<AssetVariantView[]> {
    const result = await client.query<AssetVariantRecord>(
      `
        SELECT
          id::text AS id,
          variant_key,
          bucket,
          object_key,
          mime_type,
          width,
          height,
          size_bytes::text AS size_bytes,
          metadata
        FROM asset_variants
        WHERE asset_id = $1::uuid
        ORDER BY created_at ASC, id ASC
      `,
      [assetId],
    );

    return result.rows.map(mapVariant);
  }
}
