import type { Pool } from "pg";

import type { PaymentsService } from "./payments.service.js";

export class PaymentReconciler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly options: { intervalMs: number; logger: { error: (payload: object, message: string) => void; info: (payload: object, message: string) => void }; payments: PaymentsService; pool: Pool }) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.runOnce(); }, this.options.intervalMs);
    void this.runOnce();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 25));
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const client = await this.options.pool.connect();
    try {
      const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext('tapflow:xunhupay:reconcile')) AS locked");
      if (!lock.rows[0]?.locked) return;
      try {
        const candidates = await client.query<{ id: string }>(`SELECT id::text FROM billing_wallet_payments
          WHERE status IN ('pending', 'checkout_created', 'refund_pending')
          ORDER BY updated_at ASC, created_at ASC, id ASC
          LIMIT 50 FOR UPDATE SKIP LOCKED`);
        for (const candidate of candidates.rows) {
          try {
            await this.options.payments.queryAdminPayment(candidate.id);
          } catch (error) {
            this.options.logger.error({ err: error, paymentId: candidate.id }, "payment reconciliation query failed");
          }
        }
        this.options.logger.info({ candidateCount: candidates.rows.length }, "payment reconciliation completed");
      } finally {
        await client.query("SELECT pg_advisory_unlock(hashtext('tapflow:xunhupay:reconcile'))");
      }
    } finally {
      client.release();
      this.running = false;
    }
  }
}
