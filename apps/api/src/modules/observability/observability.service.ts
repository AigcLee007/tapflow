import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { Pool } from "pg";
import { withPlatformTransaction } from "../../http/platform-transaction.js";

import type {
  QueueHealthResponse,
  QueueHealthService,
} from "../queues/queues.service.js";

type PgPool = Pool;

type ObservabilityContext = {
  tenantId?: string | null;
  userId: string | null;
};

export type AdminHealthResponse = {
  database: {
    status: "degraded" | "ok";
  };
  queues: QueueHealthResponse["queues"];
  redis: QueueHealthResponse["redis"];
  status: "degraded" | "ok";
  timestamp: string;
  uptimeSeconds: number;
  version: string | null;
};

export type AdminMetricsResponse = {
  memoryUsage: NodeJS.MemoryUsage;
  process: {
    pid: number;
    uptimeSeconds: number;
  };
  payments: {
    averagePaidLatencyMs: number | null;
    paidLast24Hours: number;
    pendingReconciliation: number;
    refundFailuresLast24Hours: number;
  };
  queueCounts: QueueHealthResponse["queues"];
  timestamp: string;
  workflowRuns: {
    failed: number;
    total: number;
  };
};

export class ObservabilityService {
  readonly pool: PgPool;
  readonly queueHealthService: QueueHealthService;

  constructor(options: {
    pool?: PgPool;
    queueHealthService: QueueHealthService;
  }) {
    this.pool = options.pool ?? createPgPool();
    this.queueHealthService = options.queueHealthService;
  }

  async getAdminHealth(): Promise<AdminHealthResponse> {
    const timestamp = new Date().toISOString();
    let databaseStatus: "degraded" | "ok" = "ok";
    let queueHealth: QueueHealthResponse = {
      queues: [],
      redis: {
        status: "degraded",
      },
    };

    try {
      await this.pool.query("SELECT 1");
    } catch {
      databaseStatus = "degraded";
    }

    try {
      queueHealth = await this.queueHealthService.getHealth();
    } catch {
      queueHealth = {
        queues: [],
        redis: {
          status: "degraded",
        },
      };
    }

    return {
      database: {
        status: databaseStatus,
      },
      queues: queueHealth.queues,
      redis: queueHealth.redis,
      status: databaseStatus === "ok" && queueHealth.redis.status === "ok" ? "ok" : "degraded",
      timestamp,
      uptimeSeconds: Math.round(process.uptime()),
      version: process.env.APP_VERSION?.trim() || null,
    };
  }

  async getAdminMetrics(context: ObservabilityContext): Promise<AdminMetricsResponse> {
    const queueHealth = await this.queueHealthService.getHealth().catch(() => ({
      queues: [],
      redis: {
        status: "degraded" as const,
      },
    }));

    const workflowRuns = await withPlatformTransaction(this.pool, context, "platform:console:access", async (client) => {
      const result = await client.query<{
        failed_count: number;
        total_count: number;
      }>(
        `
          SELECT
            COUNT(*)::int AS total_count,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count
          FROM workflow_runs
        `,
      );

      return {
        failed: result.rows[0]?.failed_count ?? 0,
        total: result.rows[0]?.total_count ?? 0,
      };
    });

    const payments = await withPlatformTransaction(this.pool, context, "platform:console:access", async (client) => {
      const result = await client.query<{
        average_paid_latency_ms: string | null;
        paid_last_24_hours: number;
        pending_reconciliation: number;
        refund_failures_last_24_hours: number;
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('pending', 'checkout_created', 'refund_pending'))::int AS pending_reconciliation,
          COUNT(*) FILTER (WHERE paid_at >= now() - interval '24 hours')::int AS paid_last_24_hours,
          COUNT(*) FILTER (WHERE status = 'refund_failed' AND updated_at >= now() - interval '24 hours')::int AS refund_failures_last_24_hours,
          AVG(EXTRACT(EPOCH FROM (paid_at - created_at)) * 1000) FILTER (WHERE paid_at >= now() - interval '24 hours')::text AS average_paid_latency_ms
        FROM billing_wallet_payments
      `);
      const row = result.rows[0];
      return {
        averagePaidLatencyMs: row?.average_paid_latency_ms ? Math.round(Number(row.average_paid_latency_ms)) : null,
        paidLast24Hours: row?.paid_last_24_hours ?? 0,
        pendingReconciliation: row?.pending_reconciliation ?? 0,
        refundFailuresLast24Hours: row?.refund_failures_last_24_hours ?? 0,
      };
    });

    return {
      memoryUsage: process.memoryUsage(),
      process: {
        pid: process.pid,
        uptimeSeconds: Math.round(process.uptime()),
      },
      payments,
      queueCounts: queueHealth.queues,
      timestamp: new Date().toISOString(),
      workflowRuns,
    };
  }

}
