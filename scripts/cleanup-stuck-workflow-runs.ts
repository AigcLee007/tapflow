import { pathToFileURL } from "node:url";

import { createPgPool, withTenantTransaction, BillingService } from "@aigc-flow/db";

export type CleanupArgs = {
  after: string | null;
  apply: boolean;
  before: string | null;
  reason: string;
  tenantId: string | null;
};

type CandidateNode = {
  cost_json: Record<string, unknown>;
  node_run_id: string;
  workflow_run_id: string;
};

const DEFAULT_REASON = "cleanup stuck pending/runnable run after queue outage";
const ERROR_CODE = "QUEUE_ENQUEUE_FAILED_OR_STALE_RUN";

export function parseCleanupArgs(argv: string[]): CleanupArgs {
  const args: CleanupArgs = {
    after: null,
    apply: false,
    before: null,
    reason: DEFAULT_REASON,
    tenantId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case "--after":
        args.after = next ?? null;
        index += 1;
        break;
      case "--apply":
        args.apply = true;
        break;
      case "--before":
        args.before = next ?? null;
        index += 1;
        break;
      case "--reason":
        args.reason = next?.trim() || DEFAULT_REASON;
        index += 1;
        break;
      case "--tenant-id":
        args.tenantId = next ?? null;
        index += 1;
        break;
      default:
        break;
    }
  }

  return args;
}

export function buildCleanupError(reason: string, cleanedAt = new Date()): Record<string, unknown> {
  return {
    cleanedAt: cleanedAt.toISOString(),
    code: ERROR_CODE,
    reason: reason || DEFAULT_REASON,
  };
}

export function readReservedCents(costJson: Record<string, unknown>): number {
  const value = costJson.reservedCents;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function shouldRefund(costJson: Record<string, unknown>): boolean {
  return costJson.reserveStatus === "reserved" && readReservedCents(costJson) > 0;
}

function assertArgs(args: CleanupArgs): asserts args is CleanupArgs & {
  after: string;
  before: string;
  tenantId: string;
} {
  if (!args.tenantId) {
    throw new Error("Provide --tenant-id.");
  }
  if (!args.after || !args.before) {
    throw new Error("Provide both --after and --before to bound the cleanup window.");
  }
  if (Number.isNaN(Date.parse(args.after)) || Number.isNaN(Date.parse(args.before))) {
    throw new Error("--after and --before must be valid ISO timestamps.");
  }
}

async function main() {
  const args = parseCleanupArgs(process.argv.slice(2));
  assertArgs(args);

  const pool = createPgPool();
  const billing = new BillingService({ pool });
  const cleanedAt = new Date();
  const errorJson = buildCleanupError(args.reason, cleanedAt);
  const summary = {
    dryRun: !args.apply,
    matchedCount: 0,
    refundedCount: 0,
    skippedCount: 0,
    updatedNodeCount: 0,
    updatedWorkflowCount: 0,
  };

  try {
    await withTenantTransaction(
      { tenantId: args.tenantId, userId: null },
      async (client) => {
        const candidates = await client.query<CandidateNode>(
          `
            SELECT
              workflow_runs.id::text AS workflow_run_id,
              node_runs.id::text AS node_run_id,
              node_runs.cost_json
            FROM workflow_runs
            JOIN node_runs
              ON node_runs.workflow_run_id = workflow_runs.id
            WHERE workflow_runs.tenant_id = $1::uuid
              AND workflow_runs.status = 'pending'
              AND workflow_runs.created_at >= $2::timestamptz
              AND workflow_runs.created_at < $3::timestamptz
              AND node_runs.status = 'runnable'
              AND node_runs.started_at IS NULL
              AND node_runs.finished_at IS NULL
              AND node_runs.error_json IS NULL
              AND NOT EXISTS (
                SELECT 1
                FROM node_runs AS other_nodes
                WHERE other_nodes.workflow_run_id = workflow_runs.id
                  AND NOT (
                    other_nodes.status = 'runnable'
                    AND other_nodes.started_at IS NULL
                    AND other_nodes.finished_at IS NULL
                    AND other_nodes.error_json IS NULL
                  )
              )
            ORDER BY workflow_runs.created_at ASC, workflow_runs.id ASC
          `,
          [args.tenantId, args.after, args.before],
        );

        summary.matchedCount = candidates.rowCount ?? candidates.rows.length;
        if (!args.apply) {
          return;
        }

        for (const row of candidates.rows) {
          if (shouldRefund(row.cost_json)) {
            const idempotencyKey = `cleanup:refund:${args.tenantId}:${row.workflow_run_id}:${row.node_run_id}`;
            const existingRefund = await client.query<{ id: string }>(
              `
                SELECT id::text AS id
                FROM billing_ledger
                WHERE tenant_id = $1::uuid
                  AND idempotency_key = $2
                LIMIT 1
              `,
              [args.tenantId, idempotencyKey],
            );
            if (!existingRefund.rows[0]) {
              await billing.refundUsageWithClient(client, args.tenantId, {
                amountCents: readReservedCents(row.cost_json),
                description: args.reason,
                idempotencyKey,
                metadata: {
                  cleanupCode: ERROR_CODE,
                  nodeRunId: row.node_run_id,
                  workflowRunId: row.workflow_run_id,
                },
              });
              summary.refundedCount += 1;
            }
          }
        }

        const nodeUpdate = await client.query(
          `
            UPDATE node_runs
            SET
              status = 'failed',
              error_json = $4::jsonb,
              finished_at = now(),
              updated_at = now(),
              cost_json = CASE
                WHEN COALESCE(cost_json->>'reserveStatus', '') = 'reserved'
                  THEN cost_json || '{"reserveStatus":"refunded"}'::jsonb
                ELSE cost_json
              END
            WHERE id = ANY($1::uuid[])
              AND tenant_id = $2::uuid
              AND status = 'runnable'
              AND started_at IS NULL
              AND finished_at IS NULL
              AND error_json IS NULL
          `,
          [
            candidates.rows.map((row) => row.node_run_id),
            args.tenantId,
            JSON.stringify(errorJson),
          ],
        );
        summary.updatedNodeCount = nodeUpdate.rowCount ?? 0;

        const workflowUpdate = await client.query(
          `
            UPDATE workflow_runs
            SET
              status = 'failed',
              error_json = $3::jsonb,
              finished_at = now(),
              updated_at = now()
            WHERE id = ANY($1::uuid[])
              AND tenant_id = $2::uuid
              AND status = 'pending'
          `,
          [
            Array.from(new Set(candidates.rows.map((row) => row.workflow_run_id))),
            args.tenantId,
            JSON.stringify(errorJson),
          ],
        );
        summary.updatedWorkflowCount = workflowUpdate.rowCount ?? 0;
      },
      pool,
    );

    summary.skippedCount = Math.max(0, summary.matchedCount - summary.updatedNodeCount);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
