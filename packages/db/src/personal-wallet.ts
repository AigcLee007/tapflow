import type { Pool, PoolClient } from "pg";

import { createPgPool } from "./db.js";
import type { BillingListOptions } from "./billing.js";
import { withUserTransaction, type UserDbContext } from "./transaction.js";

export type PersonalWalletContext = { tenantId?: string | null; userId: string };
export type WalletLedgerView = { id: string; userId: string; walletId: string; tenantId: string | null; usageEventId: string | null; entryType: string; amountCredits: number; idempotencyKey: string; createdAt: string };
export type WalletCreditInput = { amountCredits: number; expiresAt: string | null; idempotencyKey: string; sourceId: string; sourceType: "payment" | "redeem" | "admin_grant" | "migration"; metadata?: Record<string, unknown> };
export type WalletReserveInput = { amountCredits: number; idempotencyKey: string; workflowRunId?: string | null; nodeRunId?: string | null; metadata?: Record<string, unknown> };
export type WalletSettleInput = { amountCredits: number; idempotencyKey: string; reserveLedgerId: string; usageEventId: string; metadata?: Record<string, unknown> };
export type WalletRefundInput = { idempotencyKey: string; reserveLedgerId: string; usageEventId?: string | null; metadata?: Record<string, unknown> };
export type WalletSummaryView = { availableCredits: number; balanceCredits: number; expiringSoonCredits: number; nearestExpiryAt: string | null; reservedCredits: number; walletId: string };

export class PersonalWalletServiceError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400) { super(message); this.name = "PersonalWalletServiceError"; }
}

type LedgerRow = { id: string; wallet_id: string; user_id: string; tenant_id: string | null; usage_event_id: string | null; entry_type: string; amount_credits: string; idempotency_key: string; created_at: string };
function mapLedger(row: LedgerRow): WalletLedgerView { return { id: row.id, walletId: row.wallet_id, userId: row.user_id, tenantId: row.tenant_id, usageEventId: row.usage_event_id, entryType: row.entry_type, amountCredits: Number(row.amount_credits), idempotencyKey: row.idempotency_key, createdAt: row.created_at }; }

export class PersonalWalletService {
  readonly pool: Pool;
  constructor(options?: { pool?: Pool }) { this.pool = options?.pool ?? createPgPool(); }

  async getSummary(context: PersonalWalletContext): Promise<WalletSummaryView> {
    return withUserTransaction(context, async (client) => {
      const result = await client.query<{ wallet_id: string; balance: string; reserved: string; expiring: string; nearest: string | null }>(`
        SELECT wallet.id::text AS wallet_id, wallet.balance_credits::text AS balance, wallet.reserved_credits::text AS reserved,
          COALESCE(SUM(grant.remaining_credits - grant.reserved_credits) FILTER (WHERE grant.status = 'active' AND grant.expires_at <= now() + interval '30 days'), 0)::text AS expiring,
          MIN(grant.expires_at)::text AS nearest
        FROM billing_wallets wallet LEFT JOIN billing_wallet_credit_grants grant ON grant.wallet_id = wallet.id AND grant.status = 'active'
        WHERE wallet.user_id = $1::uuid GROUP BY wallet.id`, [context.userId]);
      const row = result.rows[0];
      if (!row) return { walletId: "", balanceCredits: 0, reservedCredits: 0, availableCredits: 0, expiringSoonCredits: 0, nearestExpiryAt: null };
      const balance = Number(row.balance); const reserved = Number(row.reserved);
      return { walletId: row.wallet_id, balanceCredits: balance, reservedCredits: reserved, availableCredits: Math.max(balance - reserved, 0), expiringSoonCredits: Number(row.expiring), nearestExpiryAt: row.nearest };
    }, this.pool);
  }

  async listLedger(context: PersonalWalletContext, options: BillingListOptions = {}): Promise<{ items: WalletLedgerView[]; page: number; pageSize: number }> {
    const page = Math.max(options.page ?? 1, 1); const pageSize = Math.min(Math.max(options.limit ?? 50, 1), 100);
    return withUserTransaction(context, async (client) => {
      const result = await client.query<LedgerRow>(`SELECT id::text, wallet_id::text, user_id::text, tenant_id::text, usage_event_id::text, entry_type, amount_credits::text, idempotency_key, created_at::text FROM billing_wallet_ledger WHERE user_id = $1::uuid ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, [context.userId, pageSize, (page - 1) * pageSize]);
      return { items: result.rows.map(mapLedger), page, pageSize };
    }, this.pool);
  }

  async credit(context: { userId: string }, input: WalletCreditInput): Promise<WalletLedgerView> {
    return withUserTransaction({ userId: context.userId }, (client) => this.creditWithClient(client, context.userId, input), this.pool);
  }
  private async creditWithClient(client: PoolClient, userId: string, input: WalletCreditInput): Promise<WalletLedgerView> {
    const result = await client.query<LedgerRow>(`SELECT * FROM app.wallet_credit($1::uuid, $2::numeric, $3::timestamptz, $4, $5, $6, $7::jsonb)`, [userId, input.amountCredits, input.expiresAt, input.idempotencyKey, input.sourceId, input.sourceType, JSON.stringify(input.metadata ?? {})]);
    if (!result.rows[0]) throw new PersonalWalletServiceError("WALLET_CREDIT_FAILED", "Unable to credit personal wallet", 500);
    return mapLedger(result.rows[0]);
  }
  async reserveUsage(context: PersonalWalletContext, input: WalletReserveInput): Promise<WalletLedgerView> { return withUserTransaction(context, (client) => this.reserveUsageWithClient(client, context, input), this.pool); }
  async reserveUsageWithClient(client: PoolClient, context: PersonalWalletContext, input: WalletReserveInput): Promise<WalletLedgerView> {
    try { const r = await client.query<LedgerRow>(`SELECT * FROM app.wallet_reserve($1::uuid, $2::uuid, $3::numeric, $4, $5::uuid, $6::uuid, $7::jsonb)`, [context.userId, context.tenantId ?? null, input.amountCredits, input.idempotencyKey, input.workflowRunId ?? null, input.nodeRunId ?? null, JSON.stringify(input.metadata ?? {})]); if (!r.rows[0]) throw new Error("empty reserve"); return mapLedger(r.rows[0]); }
    catch (error) { if (error instanceof Error && error.message.includes("INSUFFICIENT_BALANCE")) throw new PersonalWalletServiceError("INSUFFICIENT_BALANCE", "Insufficient personal wallet balance", 402); throw error; }
  }
  async settleUsageWithClient(client: PoolClient, context: PersonalWalletContext, input: WalletSettleInput): Promise<WalletLedgerView> { return this.completeWithClient(client, "settle", context, input.reserveLedgerId, input.usageEventId, input.idempotencyKey, input.metadata); }
  async refundUsageWithClient(client: PoolClient, context: PersonalWalletContext, input: WalletRefundInput): Promise<WalletLedgerView> { return this.completeWithClient(client, "refund", context, input.reserveLedgerId, input.usageEventId ?? null, input.idempotencyKey, input.metadata); }
  private async completeWithClient(client: PoolClient, operation: "settle" | "refund", context: PersonalWalletContext, reserveLedgerId: string, usageEventId: string | null, idempotencyKey: string, metadata?: Record<string, unknown>): Promise<WalletLedgerView> {
    const r = await client.query<LedgerRow>(`SELECT * FROM app.wallet_settle_or_refund($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7::jsonb)`, [operation, context.userId, context.tenantId ?? null, reserveLedgerId, usageEventId, idempotencyKey, JSON.stringify(metadata ?? {})]);
    if (!r.rows[0]) throw new PersonalWalletServiceError("WALLET_COMPLETION_FAILED", "Unable to complete wallet reservation", 500); return mapLedger(r.rows[0]);
  }
  async expireDueGrants(input: { limit?: number; now?: string } = {}): Promise<{ expiredCredits: number; expiredGrantCount: number }> {
    const r = await this.pool.query<{ expired_credits: string; expired_grant_count: number }>(`SELECT * FROM app.wallet_expire_due($1::integer, $2::timestamptz)`, [input.limit ?? 500, input.now ?? null]);
    return { expiredCredits: Number(r.rows[0]?.expired_credits ?? 0), expiredGrantCount: Number(r.rows[0]?.expired_grant_count ?? 0) };
  }
}
