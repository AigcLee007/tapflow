import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildAssetObjectKey, type StorageProvider } from "@aigc-flow/storage";
import type { Pool } from "pg";

import {
  isReferenceVideoSizeCompliant,
  probeReferenceVideo,
  resolveReferenceVideoTargetSize,
  transcodeReferenceVideo,
  type ReferenceVideoSize,
} from "./video-reference-variant.js";

const REFERENCE_VARIANT_KEY = "reference-720p";

type AssetRow = {
  bucket: string;
  height: number | null;
  id: string;
  kind: string;
  metadata: Record<string, string>;
  mime_type: string;
  object_key: string;
  tenant_id: string;
  width: number | null;
};

export type VideoReferenceVariantProcessorInput = {
  assetId: string;
  tenantId: string;
};

export type VideoReferenceVariantProcessorResult = {
  assetId: string;
  height: number | null;
  status: "ready";
  transcoded: boolean;
  variantCount: number;
  width: number | null;
};

export class VideoReferenceVariantProcessor {
  readonly pool: Pool;
  readonly storageProvider: StorageProvider;

  constructor(options: { pool: Pool; storageProvider: StorageProvider }) {
    this.pool = options.pool;
    this.storageProvider = options.storageProvider;
  }

  async process(input: VideoReferenceVariantProcessorInput): Promise<VideoReferenceVariantProcessorResult> {
    const asset = await this.loadAsset(input);
    if (!asset) {
      throw new Error(`Asset not found for reference video variant processing: ${input.assetId}`);
    }
    if (asset.kind !== "video" || !asset.mime_type.startsWith("video/")) {
      return { assetId: input.assetId, height: asset.height, status: "ready", transcoded: false, variantCount: 0, width: asset.width };
    }
    await this.updateStatus(input, "pending");

    let directory: string | null = null;
    try {
      if (!this.storageProvider.getObject) {
        throw new Error("REFERENCE_VIDEO_STORAGE_READ_UNAVAILABLE");
      }
      const original = await this.storageProvider.getObject({ bucket: asset.bucket, key: asset.object_key });
      directory = await mkdtemp(join(tmpdir(), "tapflow-reference-video-"));
      const inputPath = join(directory, "input");
      const outputPath = join(directory, "reference-720p.mp4");
      await writeFile(inputPath, original.body);
      const sourceSize = await probeReferenceVideo(inputPath);
      if (isReferenceVideoSizeCompliant(sourceSize.width, sourceSize.height)) {
        await this.updateStatus(input, "ready");
        return { assetId: input.assetId, height: sourceSize.height, status: "ready", transcoded: false, variantCount: 0, width: sourceSize.width };
      }

      const target = resolveReferenceVideoTargetSize(sourceSize.width, sourceSize.height);
      await transcodeReferenceVideo(inputPath, outputPath, { target });
      const body = await readFile(outputPath);
      const objectKey = buildAssetObjectKey({
        assetId: input.assetId,
        filename: `${REFERENCE_VARIANT_KEY}.mp4`,
        tenantId: input.tenantId,
      });
      await this.storageProvider.putObject({
        body,
        bucket: asset.bucket,
        contentType: "video/mp4",
        key: objectKey,
        metadata: { assetId: input.assetId, source: "video-reference-variant", variantKey: REFERENCE_VARIANT_KEY },
      });
      await this.upsertVariant(input, asset.bucket, objectKey, target, body.byteLength);
      await this.updateStatus(input, "ready");
      return { assetId: input.assetId, height: target.height, status: "ready", transcoded: true, variantCount: 1, width: target.width };
    } catch (error) {
      await this.updateStatus(input, "failed", error instanceof Error ? error.message.slice(0, 120) : "REFERENCE_VIDEO_VARIANT_FAILED");
      throw error;
    } finally {
      if (directory) {
        await rm(directory, { force: true, recursive: true }).catch(() => undefined);
      }
    }
  }

  private async loadAsset(input: VideoReferenceVariantProcessorInput): Promise<AssetRow | null> {
    const result = await this.pool.query<AssetRow>(
      `
        SELECT id::text AS id, tenant_id::text AS tenant_id, kind, mime_type, bucket, object_key,
               width, height, metadata
        FROM assets
        WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'available' AND deleted_at IS NULL
        LIMIT 1
      `,
      [input.assetId, input.tenantId],
    );
    return result.rows[0] ?? null;
  }

  private async updateStatus(input: VideoReferenceVariantProcessorInput, status: "pending" | "ready" | "failed", error?: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE assets
        SET metadata = (COALESCE(metadata, '{}'::jsonb) - 'referenceVideoVariantError') || $3::jsonb,
            updated_at = now()
        WHERE id = $1::uuid AND tenant_id = $2::uuid AND deleted_at IS NULL
      `,
      [input.assetId, input.tenantId, JSON.stringify({
        referenceVideoVariantStatus: status,
        ...(error ? { referenceVideoVariantError: error } : {}),
      })],
    );
  }

  private async upsertVariant(
    input: VideoReferenceVariantProcessorInput,
    bucket: string,
    objectKey: string,
    target: ReferenceVideoSize,
    sizeBytes: number,
  ): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO asset_variants (
          tenant_id, asset_id, variant_key, bucket, object_key, mime_type,
          width, height, size_bytes, metadata
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'video/mp4', $6::int, $7::int, $8::bigint, $9::jsonb)
        ON CONFLICT (asset_id, variant_key) DO UPDATE SET
          bucket = EXCLUDED.bucket, object_key = EXCLUDED.object_key, mime_type = EXCLUDED.mime_type,
          width = EXCLUDED.width, height = EXCLUDED.height, size_bytes = EXCLUDED.size_bytes,
          metadata = EXCLUDED.metadata
      `,
      [
        input.tenantId,
        input.assetId,
        REFERENCE_VARIANT_KEY,
        bucket,
        objectKey,
        target.width,
        target.height,
        sizeBytes,
        JSON.stringify({ codec: "h264", maxLongEdge: 1280, maxShortEdge: 720, source: "video-reference-variant" }),
      ],
    );
  }
}

export const VIDEO_REFERENCE_VARIANT_KEY = REFERENCE_VARIANT_KEY;
