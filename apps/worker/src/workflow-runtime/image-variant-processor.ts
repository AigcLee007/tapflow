import { buildAssetObjectKey, type StorageProvider } from "@aigc-flow/storage";
import type { Pool, PoolClient } from "pg";

import { createImageVariants } from "./media-variants.js";

type AssetRow = {
  bucket: string;
  id: string;
  mime_type: string;
  node_run_id: string | null;
  object_key: string;
  tenant_id: string;
  workflow_run_id: string | null;
};

export type ImageVariantProcessorInput = {
  assetId: string;
  tenantId: string;
};

export class ImageVariantProcessor {
  readonly pool: Pool;
  readonly storageProvider: StorageProvider;

  constructor(options: {
    pool: Pool;
    storageProvider: StorageProvider;
  }) {
    this.pool = options.pool;
    this.storageProvider = options.storageProvider;
  }

  async process(input: ImageVariantProcessorInput): Promise<{ assetId: string; variantCount: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.processWithClient(client, input);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async processWithClient(
    client: PoolClient,
    input: ImageVariantProcessorInput,
  ): Promise<{ assetId: string; variantCount: number }> {
    const assetResult = await client.query<AssetRow>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          workflow_run_id::text AS workflow_run_id,
          node_run_id::text AS node_run_id,
          bucket,
          object_key,
          mime_type
        FROM assets
        WHERE id = $1::uuid
          AND tenant_id = $2::uuid
          AND status = 'available'
        LIMIT 1
      `,
      [input.assetId, input.tenantId],
    );
    const asset = assetResult.rows[0];
    if (!asset) {
      throw new Error(`Asset not found for image variant processing: ${input.assetId}`);
    }
    if (!asset.mime_type.startsWith("image/")) {
      return { assetId: input.assetId, variantCount: 0 };
    }
    if (!this.storageProvider.getObject) {
      throw new Error("Storage provider does not support object reads for image variant processing");
    }

    const original = await this.storageProvider.getObject({
      bucket: asset.bucket,
      key: asset.object_key,
    });
    const variants = await createImageVariants({
      body: Buffer.from(original.body),
      mimeType: asset.mime_type,
    });

    for (const variant of variants) {
      const variantObjectKey = buildAssetObjectKey({
        assetId: input.assetId,
        filename: `${variant.variantKey}.webp`,
        tenantId: input.tenantId,
      });
      await this.storageProvider.putObject({
        body: variant.body,
        bucket: asset.bucket,
        contentType: variant.mimeType,
        key: variantObjectKey,
        metadata: {
          assetId: input.assetId,
          nodeRunId: asset.node_run_id ?? "",
          variantKey: variant.variantKey,
          workflowRunId: asset.workflow_run_id ?? "",
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
          input.tenantId,
          input.assetId,
          variant.variantKey,
          asset.bucket,
          variantObjectKey,
          variant.mimeType,
          variant.width,
          variant.height,
          variant.body.byteLength,
          JSON.stringify({
            source: "image-variant-processor",
          }),
        ],
      );
    }

    return { assetId: input.assetId, variantCount: variants.length };
  }
}
