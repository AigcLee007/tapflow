import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import { S3StorageProvider } from "@aigc-flow/storage";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

export type AssetVariantRecord = {
  body: Buffer;
  height: number | null;
  mimeType: "image/webp";
  variantKey: "thumb" | "preview";
  width: number | null;
};

type BackfillEnv = {
  s3AccessKeyId: string;
  s3Bucket: string;
  s3Endpoint: string;
  s3ForcePathStyle: boolean;
  s3Region: string;
  s3SecretAccessKey: string;
};

const IMAGE_MIME_RE = /^image\/(png|jpe?g|webp)$/i;

function parseBooleanEnv(name: string, value: string | undefined, fallback: boolean): boolean {
  const raw = value?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }
  throw new Error(`${name} must be a boolean when provided`);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to run asset variant backfill`);
  }
  return value;
}

export function parseLimitArg(argv: string[]): number {
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 50;

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("--limit must be a positive integer");
  }

  return limit;
}

export function isDirectExecution(moduleUrl: string, argvEntry: string | undefined): boolean {
  if (!argvEntry) {
    return false;
  }

  return moduleUrl === pathToFileURL(resolve(argvEntry)).href;
}

export function getBackfillEnv(): BackfillEnv {
  return {
    s3AccessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
    s3Bucket: requireEnv("S3_BUCKET"),
    s3Endpoint: requireEnv("S3_ENDPOINT"),
    s3ForcePathStyle: parseBooleanEnv(
      "S3_FORCE_PATH_STYLE",
      process.env.S3_FORCE_PATH_STYLE,
      false,
    ),
    s3Region: requireEnv("S3_REGION"),
    s3SecretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
  };
}

async function buildWebpVariant(
  body: Buffer,
  variantKey: "thumb" | "preview",
  size: number,
  quality: number,
): Promise<AssetVariantRecord> {
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

export async function createImageVariants(input: {
  body: Buffer;
  mimeType: string;
}): Promise<AssetVariantRecord[]> {
  if (!IMAGE_MIME_RE.test(input.mimeType)) {
    return [];
  }

  const [thumb, preview] = await Promise.all([
    buildWebpVariant(input.body, "thumb", 320, 72),
    buildWebpVariant(input.body, "preview", 1024, 78),
  ]);

  return [thumb, preview];
}

async function readObjectBody(
  readClient: S3Client,
  bucket: string,
  key: string,
): Promise<Buffer> {
  const result = await readClient.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  }));

  if (!result.Body) {
    throw new Error(`Object body missing for s3://${bucket}/${key}`);
  }

  return Buffer.from(await result.Body.transformToByteArray());
}

export async function runBackfill(argv = process.argv): Promise<void> {
  const env = getBackfillEnv();
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
  const dryRun = argv.includes("--dry-run");
  const limit = parseLimitArg(argv);

  try {
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
      const body = await readObjectBody(readClient, asset.bucket, asset.object_key);
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
  } finally {
    await pool.end();
    readClient.destroy();
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  void runBackfill(process.argv).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
