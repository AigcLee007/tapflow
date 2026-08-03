import { randomUUID } from "node:crypto";

import { createPgPool, safeRecordAuditLog, withTenantTransaction } from "@aigc-flow/db";
import {
  buildAssetObjectKey,
  type PutObjectInput,
  type StorageProvider,
} from "@aigc-flow/storage";
import type { Pool, PoolClient } from "pg";
import sharp from "sharp";

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
  previewUrl?: string;
  previewUrlExpiresAt?: string;
  previewVariantKey?: string | null;
};

type AssetForStorage = {
  bucket: string;
  id: string;
  mimeType: string;
  objectKey: string;
  originalFilename: string | null;
  status: string;
};

type AssetStorageTarget = {
  assetId: string;
  bucket: string;
  key: string;
  mimeType: string;
  originalFilename: string | null;
  variantKey: string | null;
};

type BulkAssetStorageRow = {
  asset_bucket: string;
  asset_id: string;
  asset_mime_type: string;
  asset_object_key: string;
  deleted_at: string | null;
  original_filename: string | null;
  status: string;
  variant_bucket: string | null;
  variant_key: "thumb" | "preview" | null;
  variant_mime_type: string | null;
  variant_object_key: string | null;
};

type SignedAssetCandidate = {
  asset: AssetStorageTarget;
  available: boolean;
  variants: Map<"thumb" | "preview", AssetStorageTarget>;
};

type SignedVariantKey = "thumb" | "preview";
type SignedUrlRequestItem = {
  allowVariantFallback: boolean;
  assetId: string;
  variantKey?: SignedVariantKey;
};

type SignedUrlSuccess = {
  assetId: string;
  expiresAt: string;
  method: "GET";
  requestedVariantKey: SignedVariantKey | null;
  servedVariantKey: SignedVariantKey | null;
  status: "ok" | "fallback";
  url: string;
  variantKey: SignedVariantKey | null;
};

function groupSignedAssetCandidates(rows: BulkAssetStorageRow[]): Map<string, SignedAssetCandidate> {
  const candidates = new Map<string, SignedAssetCandidate>();
  for (const row of rows) {
    let candidate = candidates.get(row.asset_id);
    if (!candidate) {
      candidate = {
        asset: {
          assetId: row.asset_id,
          bucket: row.asset_bucket,
          key: row.asset_object_key,
          mimeType: row.asset_mime_type,
          originalFilename: row.original_filename,
          variantKey: null,
        },
        available: row.status === "available" && !row.deleted_at,
        variants: new Map(),
      };
      candidates.set(row.asset_id, candidate);
    }
    if (row.variant_key && row.variant_bucket && row.variant_object_key && row.variant_mime_type) {
      candidate.variants.set(row.variant_key, {
        assetId: row.asset_id,
        bucket: row.variant_bucket,
        key: row.variant_object_key,
        mimeType: row.variant_mime_type,
        originalFilename: row.original_filename,
        variantKey: row.variant_key,
      });
    }
  }
  return candidates;
}

async function loadSignedAssetCandidates(
  client: PoolClient,
  tenantId: string,
  assetIds: string[],
): Promise<Map<string, SignedAssetCandidate>> {
  const uniqueAssetIds = Array.from(new Set(assetIds));
  if (uniqueAssetIds.length === 0) return new Map();
  const result = await client.query<BulkAssetStorageRow>(`
    SELECT
      a.id::text AS asset_id,
      a.bucket AS asset_bucket,
      a.object_key AS asset_object_key,
      a.mime_type AS asset_mime_type,
      a.original_filename,
      a.status,
      a.deleted_at,
      av.variant_key,
      av.bucket AS variant_bucket,
      av.object_key AS variant_object_key,
      av.mime_type AS variant_mime_type
    FROM assets a
    LEFT JOIN asset_variants av
      ON av.tenant_id = a.tenant_id
     AND av.asset_id = a.id
     AND av.variant_key IN ('thumb', 'preview')
    WHERE a.tenant_id = $1::uuid
      AND a.id = ANY($2::uuid[])
    ORDER BY a.id, av.variant_key
  `, [tenantId, uniqueAssetIds]);
  return groupSignedAssetCandidates(result.rows);
}

type AssetObjectForBytesResponse = {
  body: Buffer;
  contentLength: number | null;
  contentType: string | null;
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

type GeneratedUploadVariant = {
  body: Buffer;
  height: number | null;
  mimeType: "image/webp";
  variantKey: "thumb" | "preview";
  width: number | null;
};

const UPLOAD_IMAGE_MIME_RE = /^image\/(png|jpe?g|webp)$/i;

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

function getPreferredPreviewVariant(variants: AssetVariantView[]): AssetVariantView | null {
  return variants.find((variant) => variant.variantKey === "thumb")
    ?? variants.find((variant) => variant.variantKey === "preview")
    ?? null;
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

async function buildUploadWebpVariant(
  body: Buffer,
  variantKey: "thumb" | "preview",
  size: number,
  quality: number,
): Promise<GeneratedUploadVariant> {
  const output = await sharp(body, { failOn: "none" })
    .rotate()
    .resize({
      fit: "inside",
      height: size,
      width: size,
      withoutEnlargement: true,
    })
    .webp({ effort: 4, quality })
    .toBuffer({ resolveWithObject: true });

  return {
    body: output.data,
    height: output.info.height ?? null,
    mimeType: "image/webp",
    variantKey,
    width: output.info.width ?? null,
  };
}

async function createUploadImageVariants(input: {
  body: Buffer;
  mimeType: string;
}): Promise<GeneratedUploadVariant[]> {
  if (!UPLOAD_IMAGE_MIME_RE.test(input.mimeType)) return [];

  try {
    const [thumb, preview] = await Promise.all([
      buildUploadWebpVariant(input.body, "thumb", 640, 80),
      buildUploadWebpVariant(input.body, "preview", 1024, 78),
    ]);

    return [thumb, preview];
  } catch {
    return [];
  }
}

async function readUploadedImageSize(input: {
  body: Buffer;
  mimeType: string;
}): Promise<{ height: number | null; width: number | null } | null> {
  if (!UPLOAD_IMAGE_MIME_RE.test(input.mimeType)) return null;

  try {
    const metadata = await sharp(input.body, { failOn: "none" }).rotate().metadata();
    return {
      height: metadata.height ?? null,
      width: metadata.width ?? null,
    };
  } catch {
    return null;
  }
}

function buildDownloadFilename(asset: AssetForStorage): string {
  return asset.originalFilename?.trim() || `asset-${asset.id}`;
}

function normalizeAssetObjectForBytesResponse(
  object: AssetObjectForBytesResponse,
  target: {
    contentType: string;
    variantKey: string | null;
  },
): {
  body: Buffer;
  contentLength: number;
  contentType: string;
  variantKey: string | null;
} {
  return {
    body: object.body,
    contentLength: object.body.byteLength,
    contentType: object.contentType || target.contentType || "application/octet-stream",
    variantKey: target.variantKey,
  };
}

function shouldFallbackEmptyVariantBytes(input: {
  body: Buffer;
  variantKey: string | null;
}): boolean {
  return Boolean(input.variantKey) && input.body.byteLength === 0;
}

export const __assetsServiceTestUtils = {
  loadSignedAssetCandidates,
  normalizeAssetObjectForBytesResponse,
  shouldFallbackEmptyVariantBytes,
};

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

      const variantsByAssetId = await this.listVariantsForAssets(
        client,
        result.rows.map((row) => row.id),
      );

      const items = result.rows.map((row) => mapAsset(row, variantsByAssetId.get(row.id) ?? []));
      const finalItems = query.includePreviewUrls
        ? await this.attachPreviewUrls(items, query.previewExpiresInSeconds ?? 900)
        : items;

      return {
        items: finalItems,
        page,
        pageSize,
        total: total.rows[0]?.total ?? 0,
      };
    }, this.pool);
  }

  async getAssetSummary(context: AssetContext): Promise<{
    counts: {
      all: number;
      audio: number;
      image: number;
      video: number;
    };
  }> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<{ kind: string; total: number }>(
        `
          SELECT kind, COUNT(*)::int AS total
          FROM assets
          WHERE tenant_id = $1::uuid
            AND deleted_at IS NULL
            AND status = 'available'
          GROUP BY kind
        `,
        [context.tenantId],
      );

      const counts = {
        all: 0,
        audio: 0,
        image: 0,
        video: 0,
      };

      for (const row of result.rows) {
        counts.all += row.total;
        if (row.kind === "image" || row.kind === "video" || row.kind === "audio") {
          counts[row.kind] = row.total;
        }
      }

      return { counts };
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
          throw new AssetsApiError(404, "PROJECT_NOT_FOUND", "未找到对应项目");
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

  async uploadAssetBytes(
    context: AssetContext,
    assetId: string,
    input: {
      body: PutObjectInput["body"];
      contentType?: string | null;
    },
  ): Promise<{ ok: true }> {
    return withTenantTransaction(context, async (client) => {
      const asset = await this.getAssetRowForUpdate(client, context.tenantId, assetId);
      if (asset.deleted_at) {
        throw new AssetsApiError(404, "ASSET_NOT_FOUND", "Asset not found");
      }
      if (asset.status !== "uploading") {
        throw new AssetsApiError(409, "ASSET_UPLOAD_ALREADY_FINALIZED", "Asset upload is no longer pending");
      }

      await this.storageProvider.putObject({
        body: input.body,
        bucket: asset.bucket,
        contentType: input.contentType?.trim() || asset.mime_type,
        key: asset.object_key,
      });

      if (Buffer.isBuffer(input.body)) {
        const originalSize = await readUploadedImageSize({
          body: input.body,
          mimeType: input.contentType?.trim() || asset.mime_type,
        });
        if (originalSize?.width && originalSize?.height) {
          await client.query(
            `
              UPDATE assets
              SET
                width = COALESCE(width, $2::int),
                height = COALESCE(height, $3::int),
                updated_at = now()
              WHERE id = $1::uuid
            `,
            [asset.id, originalSize.width, originalSize.height],
          );
        }

        await this.persistUploadedImageVariants(
          client,
          asset,
          input.body,
          input.contentType?.trim() || asset.mime_type,
        );
      }

      return { ok: true as const };
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
    variantKey?: string,
  ): Promise<{
    expiresAt: string;
    method: "GET";
    url: string;
    variantKey: string | null;
  }> {
    return withTenantTransaction(context, async (client) => {
      const target = await this.getAssetStorageTarget(client, context.tenantId, assetId, variantKey);

      const download = await this.storageProvider.createPresignedGetUrl({
        bucket: target.bucket,
        expiresInSeconds: 900,
        key: target.key,
        responseContentDisposition: `attachment; filename="${buildDownloadFilename({
          bucket: target.bucket,
          id: target.assetId,
          mimeType: target.mimeType,
          objectKey: target.key,
          originalFilename: target.originalFilename,
          status: "available",
        })}"`,
        responseContentType: target.mimeType,
      });

      return {
        expiresAt: download.expiresAt,
        method: "GET",
        url: download.url,
        variantKey: target.variantKey,
      };
    }, this.pool);
  }

  async getAssetBytes(
    context: AssetContext,
    assetId: string,
    variantKey?: string,
  ): Promise<{
    body: Buffer;
    contentLength: number | null;
    contentType: string;
    variantKey: string | null;
  }> {
    if (!this.storageProvider.getObject) {
      throw new AssetsApiError(501, "ASSET_BYTES_UNSUPPORTED", "Asset byte reads are not supported by this storage provider");
    }

    return withTenantTransaction(context, async (client) => {
      let target: AssetStorageTarget;
      try {
        target = await this.getAssetStorageTarget(client, context.tenantId, assetId, variantKey);
      } catch (error) {
        if (variantKey && error instanceof AssetsApiError && error.code === "ASSET_VARIANT_NOT_FOUND") {
          target = await this.getAssetStorageTarget(client, context.tenantId, assetId);
        } else {
          throw error;
        }
      }
      const object = await this.storageProvider.getObject!({
        bucket: target.bucket,
        key: target.key,
      });

      if (shouldFallbackEmptyVariantBytes({ body: object.body, variantKey: target.variantKey })) {
        const originalTarget = await this.getAssetStorageTarget(client, context.tenantId, assetId);
        const originalObject = await this.storageProvider.getObject!({
          bucket: originalTarget.bucket,
          key: originalTarget.key,
        });

        return normalizeAssetObjectForBytesResponse(originalObject, {
          contentType: originalTarget.mimeType,
          variantKey: originalTarget.variantKey,
        });
      }

      return normalizeAssetObjectForBytesResponse(object, {
        contentType: target.mimeType,
        variantKey: target.variantKey,
      });
    }, this.pool);
  }

  async createSignedUrls(
    context: AssetContext,
    requests: SignedUrlRequestItem[],
  ): Promise<{
    errors: Array<{ assetId: string; code: "ASSET_UNAVAILABLE" }>;
    items: SignedUrlSuccess[];
    metrics: {
      assetLookupMs: number;
      originalFallbackCount: number;
      previewFallbackCount: number;
      requestedCount: number;
      signingMs: number;
      thumbHitCount: number;
      unavailableCount: number;
      uniqueAssetCount: number;
    };
  }> {
    return withTenantTransaction(context, async (client) => {
      const lookupStartedAt = Date.now();
      const candidates = await loadSignedAssetCandidates(client, context.tenantId, requests.map((item) => item.assetId));
      const assetLookupMs = Date.now() - lookupStartedAt;
      const signingStartedAt = Date.now();
      const signedByTarget = new Map<string, Promise<{ expiresAt: string; url: string }>>();
      const items: SignedUrlSuccess[] = [];
      const errors: Array<{ assetId: string; code: "ASSET_UNAVAILABLE" }> = [];
      let thumbHitCount = 0;
      let previewFallbackCount = 0;
      let originalFallbackCount = 0;

      const sign = (target: AssetStorageTarget) => {
        const key = `${target.bucket}:${target.key}:${target.mimeType}`;
        const existing = signedByTarget.get(key);
        if (existing) return existing;
        const promise = this.storageProvider.createPresignedGetUrl({
          bucket: target.bucket,
          expiresInSeconds: 900,
          key: target.key,
          responseContentDisposition: `inline; filename="${buildDownloadFilename({
            bucket: target.bucket,
            id: target.assetId,
            mimeType: target.mimeType,
            objectKey: target.key,
            originalFilename: target.originalFilename,
            status: "available",
          })}"`,
          responseContentType: target.mimeType,
        }).then(({ expiresAt, url }) => ({ expiresAt, url }));
        signedByTarget.set(key, promise);
        return promise;
      };

      const resolved = await Promise.all(requests.map(async (request) => {
        const candidate = candidates.get(request.assetId);
        if (!candidate?.available) return { error: { assetId: request.assetId, code: "ASSET_UNAVAILABLE" as const } };
        const requestedVariantKey = request.variantKey ?? null;
        const choices: Array<SignedVariantKey | null> = request.allowVariantFallback
          ? request.variantKey === "thumb" ? ["thumb", "preview", null] : request.variantKey === "preview" ? ["preview", null] : [null]
          : [requestedVariantKey];
        const servedVariantKey = choices.find((key) => key === null || candidate.variants.has(key));
        if (servedVariantKey === undefined) return { error: { assetId: request.assetId, code: "ASSET_UNAVAILABLE" as const } };
        const target = servedVariantKey === null ? candidate.asset : candidate.variants.get(servedVariantKey)!;
        const signed = await sign(target);
        if (servedVariantKey === "thumb") thumbHitCount += 1;
        if (requestedVariantKey === "thumb" && servedVariantKey === "preview") previewFallbackCount += 1;
        if (requestedVariantKey && servedVariantKey === null) originalFallbackCount += 1;
        return { item: {
          assetId: request.assetId,
          expiresAt: signed.expiresAt,
          method: "GET" as const,
          requestedVariantKey,
          servedVariantKey,
          status: servedVariantKey === requestedVariantKey ? "ok" as const : "fallback" as const,
          url: signed.url,
          variantKey: servedVariantKey,
        } };
      }));
      resolved.forEach((result) => result.item ? items.push(result.item) : errors.push(result.error));
      return {
        errors,
        items,
        metrics: {
          assetLookupMs,
          originalFallbackCount,
          previewFallbackCount,
          requestedCount: requests.length,
          signingMs: Date.now() - signingStartedAt,
          thumbHitCount,
          unavailableCount: errors.length,
          uniqueAssetCount: candidates.size,
        },
      };
    }, this.pool);
  }

  private async attachPreviewUrls(items: AssetView[], expiresInSeconds: number): Promise<AssetView[]> {
    return Promise.all(
      items.map(async (asset) => {
        if (asset.status !== "available") return asset;
        if (!(asset.mimeType.startsWith("image/") || asset.mimeType.startsWith("video/"))) return asset;

        const variant = getPreferredPreviewVariant(asset.variants);
        const bucket = variant?.bucket ?? asset.bucket;
        const key = variant?.objectKey ?? asset.objectKey;
        const mimeType = variant?.mimeType ?? asset.mimeType;
        const signed = await this.storageProvider.createPresignedGetUrl({
          bucket,
          expiresInSeconds,
          key,
          responseContentDisposition: `inline; filename="${buildDownloadFilename({
            bucket,
            id: asset.id,
            mimeType,
            objectKey: key,
            originalFilename: asset.originalFilename,
            status: asset.status,
          })}"`,
          responseContentType: mimeType,
        });

        return {
          ...asset,
          previewUrl: signed.url,
          previewUrlExpiresAt: signed.expiresAt,
          previewVariantKey: variant?.variantKey ?? null,
        };
      }),
    );
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

  private async getAssetStorageTarget(
    client: PoolClient,
    tenantId: string,
    assetId: string,
    variantKey?: string,
  ): Promise<AssetStorageTarget> {
    const asset = await this.getAssetRow(client, tenantId, assetId);
    if (asset.deleted_at) {
      throw new AssetsApiError(404, "ASSET_NOT_FOUND", "Asset not found");
    }
    if (asset.status !== "available") {
      throw new AssetsApiError(409, "ASSET_NOT_AVAILABLE", "Asset is not available");
    }

    if (!variantKey) {
      return {
        assetId: asset.id,
        bucket: asset.bucket,
        key: asset.object_key,
        mimeType: asset.mime_type,
        originalFilename: asset.original_filename,
        variantKey: null,
      };
    }

    const variant = await client.query<AssetVariantRecord>(
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
        WHERE tenant_id = $1::uuid
          AND asset_id = $2::uuid
          AND variant_key = $3
        LIMIT 1
      `,
      [tenantId, assetId, variantKey],
    );

    const row = variant.rows[0];
    if (!row) {
      throw new AssetsApiError(404, "ASSET_VARIANT_NOT_FOUND", "Asset variant not found");
    }

    return {
      assetId: asset.id,
      bucket: row.bucket,
      key: row.object_key,
      mimeType: row.mime_type,
      originalFilename: asset.original_filename,
      variantKey: row.variant_key,
    };
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

  private async listVariantsForAssets(
    client: PoolClient,
    assetIds: string[],
  ): Promise<Map<string, AssetVariantView[]>> {
    const byAssetId = new Map<string, AssetVariantView[]>();
    if (assetIds.length === 0) {
      return byAssetId;
    }

    const result = await client.query<AssetVariantRecord & { asset_id: string }>(
      `
        SELECT
          asset_id::text AS asset_id,
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
        WHERE asset_id = ANY($1::uuid[])
        ORDER BY asset_id ASC, created_at ASC, id ASC
      `,
      [assetIds],
    );

    for (const row of result.rows) {
      const list = byAssetId.get(row.asset_id) ?? [];
      list.push(mapVariant(row));
      byAssetId.set(row.asset_id, list);
    }

    return byAssetId;
  }

  private async persistUploadedImageVariants(
    client: PoolClient,
    asset: AssetRecord,
    body: Buffer,
    mimeType: string,
  ): Promise<void> {
    const variants = await createUploadImageVariants({ body, mimeType });
    for (const variant of variants) {
      const variantObjectKey = buildAssetObjectKey({
        assetId: asset.id,
        filename: `${variant.variantKey}.webp`,
        tenantId: asset.tenant_id,
      });

      await this.storageProvider.putObject({
        body: variant.body,
        bucket: asset.bucket,
        contentType: variant.mimeType,
        key: variantObjectKey,
        metadata: {
          assetId: asset.id,
          source: "user-upload",
          variantKey: variant.variantKey,
        },
      });

      await client.query(
        `
          INSERT INTO asset_variants (
            tenant_id,
            asset_id,
            variant_key,
            bucket,
            object_key,
            mime_type,
            width,
            height,
            size_bytes,
            metadata
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            $4,
            $5,
            $6,
            $7::int,
            $8::int,
            $9::bigint,
            $10::jsonb
          )
          ON CONFLICT (asset_id, variant_key) DO UPDATE SET
            bucket = EXCLUDED.bucket,
            object_key = EXCLUDED.object_key,
            mime_type = EXCLUDED.mime_type,
            width = EXCLUDED.width,
            height = EXCLUDED.height,
            size_bytes = EXCLUDED.size_bytes,
            metadata = EXCLUDED.metadata
        `,
        [
          asset.tenant_id,
          asset.id,
          variant.variantKey,
          asset.bucket,
          variantObjectKey,
          variant.mimeType,
          variant.width,
          variant.height,
          variant.body.byteLength,
          JSON.stringify({ source: "user-upload" }),
        ],
      );
    }
  }
}
