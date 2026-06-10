import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { getApiEnv } from "../apps/api/src/config/env.js";
import { createImageVariants } from "../apps/worker/src/workflow-runtime/media-variants.js";
import { createPgPool, withTenantTransaction } from "../packages/db/src/index.js";
import { S3StorageProvider } from "../packages/storage/src/index.js";

const env = getApiEnv();
const pool = createPgPool();
const storage = new S3StorageProvider({
  accessKeyId: env.s3AccessKeyId,
  endpoint: env.s3Endpoint,
  forcePathStyle: env.s3ForcePathStyle,
  region: env.s3Region,
  secretAccessKey: env.s3SecretAccessKey,
});
const readClient = new S3Client({
  credentials: {
    accessKeyId: env.s3AccessKeyId,
    secretAccessKey: env.s3SecretAccessKey,
  },
  endpoint: env.s3Endpoint,
  forcePathStyle: env.s3ForcePathStyle,
  region: env.s3Region,
});

const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 50;

if (!Number.isInteger(limit) || limit <= 0) {
  throw new Error("--limit must be a positive integer");
}

async function readObjectBody(bucket: string, key: string): Promise<Buffer> {
  const result = await readClient.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  }));

  if (!result.Body) {
    throw new Error(`Object body missing for s3://${bucket}/${key}`);
  }

  return Buffer.from(await result.Body.transformToByteArray());
}

async function main(): Promise<void> {
  const result = await pool.query<{
    bucket: string;
    id: string;
    mime_type: string;
    object_key: string;
    tenant_id: string;
  }>(
    `
      SELECT
        a.id::text AS id,
        a.tenant_id::text AS tenant_id,
        a.bucket,
        a.object_key,
        a.mime_type
      FROM assets a
      WHERE a.kind = 'image'
        AND a.status = 'available'
        AND a.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM asset_variants av
          WHERE av.asset_id = a.id
            AND av.variant_key IN ('thumb', 'preview')
        )
      ORDER BY a.created_at ASC
      LIMIT $1
    `,
    [limit],
  );

  for (const asset of result.rows) {
    const body = await readObjectBody(asset.bucket, asset.object_key);
    const variants = await createImageVariants({
      body,
      mimeType: asset.mime_type,
    });

    if (dryRun) {
      console.log(`[dry-run] ${asset.id}: ${variants.map((item) => item.variantKey).join(",")}`);
      continue;
    }

    await withTenantTransaction({ tenantId: asset.tenant_id, userId: null }, async (client) => {
      for (const variant of variants) {
        const key = `tenants/${asset.tenant_id}/assets/${asset.id}/${variant.variantKey}.webp`;
        await storage.putObject({
          body: variant.body,
          bucket: env.s3Bucket,
          contentType: variant.mimeType,
          key,
          metadata: {
            assetId: asset.id,
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
              '{}'::jsonb
            )
            ON CONFLICT (asset_id, variant_key) DO NOTHING
          `,
          [
            asset.tenant_id,
            asset.id,
            variant.variantKey,
            env.s3Bucket,
            key,
            variant.mimeType,
            variant.width,
            variant.height,
            variant.body.byteLength,
          ],
        );
      }
    }, pool);

    console.log(`[ok] ${asset.id}`);
  }
}

main()
  .finally(async () => {
    await pool.end();
    readClient.destroy();
  });
