import { createPgPool } from "@aigc-flow/db";
import {
  closeRedisConnection,
  createQueueFactory,
  createRedisConnection,
  QUEUE_NAMES,
  resolveQueuePrefix,
  resolveRedisUrl,
} from "@aigc-flow/redis";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BackfillArgs = {
  apply: boolean;
  batchSize: number;
  limit: number;
  missing: "thumb" | "preview" | "any";
  tenantId: string | null;
};

export type BackfillAssetRow = {
  id: string;
  tenant_id: string;
  original_size_bytes: string;
  missing_thumb: boolean;
  missing_preview: boolean;
};

type BackfillDependencies = {
  closeRedisConnection: typeof closeRedisConnection;
  createPgPool: typeof createPgPool;
  createQueueFactory: typeof createQueueFactory;
  createRedisConnection: typeof createRedisConnection;
  log: (message: string) => void;
  resolveQueuePrefix: typeof resolveQueuePrefix;
  resolveRedisUrl: typeof resolveRedisUrl;
};

function parsePositiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function parseBackfillArgs(argv: string[]): BackfillArgs {
  const values = new Map(argv.filter((item) => item.startsWith("--") && item.includes("=")).map((item) => {
    const separator = item.indexOf("=");
    return [item.slice(0, separator), item.slice(separator + 1)];
  }));
  const limit = parsePositiveInteger("--limit", values.get("--limit"), 500);
  const batchSize = parsePositiveInteger("--batch-size", values.get("--batch-size"), 25);
  if (batchSize > 100) throw new Error("--batch-size must not exceed 100");
  const missingValue = values.get("--missing") || "any";
  if (missingValue !== "thumb" && missingValue !== "preview" && missingValue !== "any") {
    throw new Error("--missing must be thumb, preview, or any");
  }
  const tenantId = values.get("--tenant-id") || null;
  if (tenantId && !UUID_RE.test(tenantId)) throw new Error("--tenant-id must be a UUID");

  return {
    apply: argv.includes("--apply") && !argv.includes("--dry-run"),
    batchSize,
    limit,
    missing: missingValue,
    tenantId,
  };
}

export function assertProductionBackfillAllowed(
  args: BackfillArgs,
  env: Pick<NodeJS.ProcessEnv, "ASSET_VARIANT_BACKFILL_PRODUCTION_ACK" | "NODE_ENV"> = process.env,
): void {
  if (
    args.apply
    && env.NODE_ENV === "production"
    && !args.tenantId
    && env.ASSET_VARIANT_BACKFILL_PRODUCTION_ACK !== "enqueue-all-tenants"
  ) {
    throw new Error("Unscoped production --apply requires ASSET_VARIANT_BACKFILL_PRODUCTION_ACK=enqueue-all-tenants");
  }
}

export function buildVariantBackfillJobId(assetId: string): string {
  return `asset-image-variant-${assetId}-v1`;
}

export function buildBackfillSummary(rows: BackfillAssetRow[]) {
  return rows.reduce((summary, row) => ({
    missingPreviewCount: summary.missingPreviewCount + Number(row.missing_preview),
    missingThumbCount: summary.missingThumbCount + Number(row.missing_thumb),
    originalBytes: summary.originalBytes + Number(row.original_size_bytes || 0),
    selectedCount: summary.selectedCount + 1,
  }), { missingPreviewCount: 0, missingThumbCount: 0, originalBytes: 0, selectedCount: 0 });
}

export function isDirectExecution(moduleUrl: string, argvEntry: string | undefined): boolean {
  return Boolean(argvEntry) && moduleUrl === pathToFileURL(resolve(argvEntry)).href;
}

export async function runBackfill(
  argv = process.argv.slice(2),
  overrides: Partial<BackfillDependencies> = {},
): Promise<void> {
  const dependencies: BackfillDependencies = {
    closeRedisConnection,
    createPgPool,
    createQueueFactory,
    createRedisConnection,
    log: console.log,
    resolveQueuePrefix,
    resolveRedisUrl,
    ...overrides,
  };
  const args = parseBackfillArgs(argv);
  assertProductionBackfillAllowed(args);
  const pool = dependencies.createPgPool();
  let redis: ReturnType<typeof createRedisConnection> | null = null;
  let queue: ReturnType<typeof createQueueFactory>["createQueue"] extends (name: typeof QUEUE_NAMES.assetImageVariant) => infer Queue ? Queue : never;

  try {
    const result = await pool.query<BackfillAssetRow>(`
      SELECT
        a.id::text AS id,
        a.tenant_id::text AS tenant_id,
        COALESCE(a.size_bytes, 0)::text AS original_size_bytes,
        (thumb.asset_id IS NULL) AS missing_thumb,
        (preview.asset_id IS NULL) AS missing_preview
      FROM assets a
      LEFT JOIN asset_variants thumb
        ON thumb.tenant_id = a.tenant_id
       AND thumb.asset_id = a.id
       AND thumb.variant_key = 'thumb'
      LEFT JOIN asset_variants preview
        ON preview.tenant_id = a.tenant_id
       AND preview.asset_id = a.id
       AND preview.variant_key = 'preview'
      WHERE a.kind = 'image'
        AND a.status = 'available'
        AND a.deleted_at IS NULL
        AND ($1::uuid IS NULL OR a.tenant_id = $1::uuid)
        AND CASE $2::text
          WHEN 'thumb' THEN thumb.asset_id IS NULL
          WHEN 'preview' THEN preview.asset_id IS NULL
          ELSE thumb.asset_id IS NULL OR preview.asset_id IS NULL
        END
      ORDER BY a.created_at, a.id
      LIMIT $3
    `, [args.tenantId, args.missing, args.limit]);
    const rows = result.rows;
    const summary = buildBackfillSummary(rows);
    dependencies.log(JSON.stringify({ ...summary, mode: args.apply ? "apply" : "audit" }));

    if (!args.apply || rows.length === 0) return;

    redis = dependencies.createRedisConnection({
      redisUrl: dependencies.resolveRedisUrl({ redisUrl: process.env.REDIS_URL }),
    });
    const factory = dependencies.createQueueFactory({
      connection: redis,
      prefix: dependencies.resolveQueuePrefix(process.env.QUEUE_PREFIX),
    });
    queue = factory.createQueue(QUEUE_NAMES.assetImageVariant);
    for (let start = 0; start < rows.length; start += args.batchSize) {
      const batch = rows.slice(start, start + args.batchSize);
      await Promise.all(batch.map((row) => queue.add(
        "asset.image-variants.create",
        { assetId: row.id, tenantId: row.tenant_id },
        { jobId: buildVariantBackfillJobId(row.id) },
      )));
    }
  } finally {
    if (queue) await queue.close();
    if (redis) await dependencies.closeRedisConnection(redis);
    await pool.end();
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  void runBackfill(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
