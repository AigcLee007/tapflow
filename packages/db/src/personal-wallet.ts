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
export type WalletAdminCreditInput = { amountCredits: number; description: string; expiresAt: string | null; idempotencyKey: string; metadata?: Record<string, unknown>; sourceId: string };
export type WalletAdminDebitInput = { amountCredits: number; description: string; idempotencyKey: string; metadata?: Record<string, unknown> };
export type WalletSummaryMap = Map<string, WalletSummaryView>;
export type WalletRedeemInput = { code: string; idempotencyKey?: string; metadata?: Record<string, unknown> };
export type WalletRedeemResultView = { credits: number; ledgerEntry: WalletLedgerView; redemptionId: string };

export class PersonalWalletServiceError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400) { super(message); this.name = "PersonalWalletServiceError"; }
}

type LedgerRow = { id: string; wallet_id: string; user_id: string; tenant_id: string | null; usage_event_id: string | null; entry_type: string; amount_credits: string; idempotency_key: string; created_at: string };
type WalletSummaryRow = { wallet_id: string; user_id: string; balance: string; reserved: string; expiring: string; nearest: string | null };
function mapLedger(row: LedgerRow): WalletLedgerView { return { id: row.id, walletId: row.wallet_id, userId: row.user_id, tenantId: row.tenant_id, usageEventId: row.usage_event_id, entryType: row.entry_type, amountCredits: Number(row.amount_credits), idempotencyKey: row.idempotency_key, createdAt: row.created_at }; }
function emptySummary(): WalletSummaryView { return { walletId: "", balanceCredits: 0, reservedCredits: 0, availableCredits: 0, expiringSoonCredits: 0, nearestExpiryAt: null }; }

export class PersonalWalletService {
  readonly pool: Pool;
  constructor(options?: { pool?: Pool }) { this.pool = options?.pool ?? createPgPool(); }

  async getSummary(context: PersonalWalletContext): Promise<WalletSummaryView> {
    return withUserTransaction(context, (client) => this.getSummaryWithClient(client, context.userId), this.pool);
  }

  async getSummaryWithClient(client: PoolClient, userId: string): Promise<WalletSummaryView> {
    return (await this.getSummariesWithClient(client, [userId])).get(userId) ?? emptySummary();
  }

  async getSummariesWithClient(client: PoolClient, userIds: string[]): Promise<WalletSummaryMap> {
    const uniqueUserIds = [...new Set(userIds)];
    const summaries: WalletSummaryMap = new Map(uniqueUserIds.map((userId) => [userId, emptySummary()]));
    if (uniqueUserIds.length === 0) return summaries;
    const result = await client.query<WalletSummaryRow>(`
        SELECT wallet.id::text AS wallet_id, wallet.balance_credits::text AS balance, wallet.reserved_credits::text AS reserved,
          COALESCE(SUM(credit_grant.remaining_credits - credit_grant.reserved_credits) FILTER (WHERE credit_grant.status = 'active' AND credit_grant.expires_at <= now() + interval '30 days'), 0)::text AS expiring,
          MIN(credit_grant.expires_at)::text AS nearest
        FROM billing_wallets wallet LEFT JOIN billing_wallet_credit_grants credit_grant ON credit_grant.wallet_id = wallet.id AND credit_grant.status = 'active'
        WHERE wallet.user_id = ANY($1::uuid[]) GROUP BY wallet.id, wallet.user_id`, [uniqueUserIds]);
    for (const row of result.rows) {
      const balance = Number(row.balance); const reserved = Number(row.reserved);
      summaries.set(row.user_id, { walletId: row.wallet_id, balanceCredits: balance, reservedCredits: reserved, availableCredits: Math.max(balance - reserved, 0), expiringSoonCredits: Number(row.expiring), nearestExpiryAt: row.nearest });
    }
    return summaries;
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
  async adminCreditWithClient(client: PoolClient, context: { actorUserId: string | null; tenantId: string; userId: string }, input: WalletAdminCreditInput): Promise<WalletLedgerView> {
    if (!Number.isFinite(input.amountCredits) || input.amountCredits <= 0) throw new PersonalWalletServiceError("INVALID_WALLET_CREDIT", "Credit amount must be positive");
    try {
      const result = await client.query<LedgerRow>(`SELECT * FROM app.wallet_admin_credit($1::uuid, $2::uuid, $3::uuid, $4::numeric, $5::timestamptz, $6, $7, $8, $9::jsonb)`, [context.actorUserId, context.userId, context.tenantId, input.amountCredits, input.expiresAt, input.idempotencyKey, input.sourceId, input.description, JSON.stringify(input.metadata ?? {})]);
      if (!result.rows[0]) throw new Error("empty administrator credit");
      return mapLedger(result.rows[0]);
    } catch (error) { throw this.mapDatabaseError(error, "WALLET_ADMIN_CREDIT_FAILED", "Unable to credit personal wallet"); }
  }
  async adminDebitWithClient(client: PoolClient, context: { actorUserId: string | null; tenantId: string; userId: string }, input: WalletAdminDebitInput): Promise<WalletLedgerView> {
    if (!Number.isFinite(input.amountCredits) || input.amountCredits <= 0) throw new PersonalWalletServiceError("INVALID_WALLET_DEBIT", "Debit amount must be positive");
    try {
      const result = await client.query<LedgerRow>(`SELECT * FROM app.wallet_admin_debit($1::uuid, $2::uuid, $3::uuid, $4::numeric, $5, $6, $7::jsonb)`, [context.actorUserId, context.userId, context.tenantId, input.amountCredits, input.idempotencyKey, input.description, JSON.stringify(input.metadata ?? {})]);
      if (!result.rows[0]) throw new Error("empty administrator debit");
      return mapLedger(result.rows[0]);
    } catch (error) { throw this.mapDatabaseError(error, "WALLET_ADMIN_DEBIT_FAILED", "Unable to debit personal wallet"); }
  }
  async redeemCode(context: PersonalWalletContext, input: WalletRedeemInput): Promise<WalletRedeemResultView> {
    if (!context.tenantId) {
      throw new PersonalWalletServiceError("REDEEM_TENANT_REQUIRED", "A workspace is required to redeem this code");
    }
    const normalizedCode = input.code.trim().toUpperCase();
    if (!normalizedCode) {
      throw new PersonalWalletServiceError("REDEEM_CODE_REQUIRED", "Redeem code is required");
    }
    const codeHash = await this.hashRedeemCode(normalizedCode);
    const idempotencyKey = input.idempotencyKey ?? `redeem:${context.userId}:${codeHash}`;
    return withUserTransaction(context, async (client) => {
      try {
        const result = await client.query<LedgerRow & { redemption_id: string }>(
          `SELECT * FROM app.wallet_redeem_code($1::uuid, $2::uuid, $3, $4, $5::jsonb)`,
          [context.userId, context.tenantId, codeHash, idempotencyKey, JSON.stringify(input.metadata ?? {})],
        );
        const row = result.rows[0];
        if (!row) throw new PersonalWalletServiceError("REDEEM_FAILED", "Unable to redeem code", 500);
        return { credits: row.amount_credits ? Number(row.amount_credits) : 0, ledgerEntry: mapLedger(row), redemptionId: row.redemption_id };
      } catch (error) {
        if (error instanceof PersonalWalletServiceError) throw error;
        throw this.mapDatabaseError(error, "REDEEM_FAILED", "Unable to redeem code");
      }
    }, this.pool);
  }
  private async creditWithClient(client: PoolClient, userId: string, input: WalletCreditInput): Promise<WalletLedgerView> {
    const result = await client.query<LedgerRow>(`SELECT * FROM app.wallet_credit($1::uuid, $2::numeric, $3::timestamptz, $4, $5, $6, $7::jsonb)`, [userId, input.amountCredits, input.expiresAt, input.idempotencyKey, input.sourceId, input.sourceType, JSON.stringify(input.metadata ?? {})]);
    if (!result.rows[0]) throw new PersonalWalletServiceError("WALLET_CREDIT_FAILED", "Unable to credit personal wallet", 500);
    return mapLedger(result.rows[0]);
  }
  async reserveUsage(context: PersonalWalletContext, input: WalletReserveInput): Promise<WalletLedgerView> { return withUserTransaction(context, (client) => this.reserveUsageWithClient(client, context, input), this.pool); }
  async reserveUsageWithClient(client: PoolClient, context: PersonalWalletContext, input: WalletReserveInput): Promise<WalletLedgerView> {
    try { const r = await client.query<LedgerRow>(`SELECT * FROM app.wallet_reserve($1::uuid, $2::uuid, $3::numeric, $4, $5::uuid, $6::uuid, $7::jsonb)`, [context.userId, context.tenantId ?? null, input.amountCredits, input.idempotencyKey, input.workflowRunId ?? null, input.nodeRunId ?? null, JSON.stringify(input.metadata ?? {})]); if (!r.rows[0]) throw new Error("empty reserve"); return mapLedger(r.rows[0]); }
    catch (error) { throw this.mapDatabaseError(error, "WALLET_RESERVE_FAILED", "Unable to reserve personal wallet balance"); }
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
  private async hashRedeemCode(code: string): Promise<string> {
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(code).digest("hex");
  }
  private mapDatabaseError(error: unknown, fallbackCode: string, fallbackMessage: string): PersonalWalletServiceError {
    const message = error instanceof Error ? error.message : fallbackMessage;
    const codeMatch = message.match(/(INSUFFICIENT_BALANCE|WALLET_FORBIDDEN|WALLET_IDEMPOTENCY_CONFLICT|REDEEM_CODE_[A-Z_]+)/);
    if (codeMatch?.[1] === "INSUFFICIENT_BALANCE") return new PersonalWalletServiceError("INSUFFICIENT_BALANCE", "Insufficient personal wallet balance", 402);
    if (codeMatch?.[1] === "WALLET_IDEMPOTENCY_CONFLICT") return new PersonalWalletServiceError("WALLET_IDEMPOTENCY_CONFLICT", "Wallet idempotency key was reused with different data", 409);
    if (codeMatch?.[1] === "WALLET_FORBIDDEN") return new PersonalWalletServiceError("WALLET_FORBIDDEN", "Administrator wallet mutation is not authorized", 403);
    if (codeMatch?.[1]) {
      const status = codeMatch[1] === "REDEEM_CODE_NOT_FOUND" ? 404 : 409;
      return new PersonalWalletServiceError(codeMatch[1], "Redeem code cannot be applied", status);
    }
    return new PersonalWalletServiceError(fallbackCode, fallbackMessage, 500);
  }
}
