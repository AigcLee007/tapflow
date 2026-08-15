import type { Pool } from "pg";

type ReferenceVideoVariantQueue = {
  add(
    name: "prepare-reference-720p",
    payload: { assetId: string; tenantId: string },
    options: { jobId: string; removeOnComplete: true },
  ): Promise<unknown>;
};

type Candidate = {
  asset_id: string;
  tenant_id: string;
};

export class ReferenceVideoVariantReconciler {
  readonly batchSize: number;
  readonly pool: Pool;
  readonly queue: ReferenceVideoVariantQueue;

  constructor(options: { batchSize?: number; pool: Pool; queue: ReferenceVideoVariantQueue }) {
    this.batchSize = Math.max(1, options.batchSize ?? 50);
    this.pool = options.pool;
    this.queue = options.queue;
  }

  async reconcile(): Promise<number> {
    const result = await this.pool.query<Candidate>(
      `
        SELECT id::text AS asset_id, tenant_id::text AS tenant_id
        FROM assets
        WHERE kind = 'video'
          AND mime_type LIKE 'video/%'
          AND status = 'available'
          AND deleted_at IS NULL
          AND COALESCE(metadata->>'referenceVideoVariantStatus', '') IN ('', 'pending')
        ORDER BY updated_at ASC, id ASC
        LIMIT $1::int
      `,
      [this.batchSize],
    );

    let queued = 0;
    for (const candidate of result.rows) {
      const marked = await this.pool.query(
        `
          UPDATE assets
          SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"referenceVideoVariantStatus":"pending"}'::jsonb,
              updated_at = now()
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
            AND status = 'available'
            AND deleted_at IS NULL
        `,
        [candidate.asset_id, candidate.tenant_id],
      );
      if (marked.rowCount === 0) continue;

      await this.queue.add(
        "prepare-reference-720p",
        { assetId: candidate.asset_id, tenantId: candidate.tenant_id },
        { jobId: `${candidate.asset_id}:reference-720p`, removeOnComplete: true },
      );
      queued += 1;
    }

    return queued;
  }
}
