# XunhuPay Personal Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace workspace-owned spendable credits with one personal wallet per user and add fixed-plan XunhuPay checkout, exactly-once crediting, expiration, reconciliation, and eligible administrator refunds.

**Architecture:** Add a user-owned wallet domain beside the immutable tenant billing history, then cut every live reserve/settle/refund path over to an immutable `billed_user_id`. Keep XunhuPay transport and secrets in the API, use a narrowly scoped database transition function for signed callbacks, and run credit expiry in the existing BullMQ worker. Migrate old available tenant grants to workspace owners with a dry-run-first, idempotent compiled CLI.

**Tech Stack:** PostgreSQL migrations and RLS, TypeScript, `pg`, Fastify 5, Zod 4, BullMQ/Redis, React 19, TanStack Query-compatible HTTP helpers, Vitest, Docker Compose v2.

---

## Implementation Map

| Responsibility | File |
| --- | --- |
| Personal-wallet schema, plan seed, workflow ownership columns, RLS, callback transition | `packages/db/migrations/000042_xunhupay_personal_wallet.sql` |
| Personal-wallet views and FEFO reserve/settle/refund/expiry behavior | `packages/db/src/personal-wallet.ts` |
| User-scoped database transaction context | `packages/db/src/transaction.ts` |
| Payment order, plan, callback, query, and refund persistence | `packages/db/src/wallet-payments.ts` |
| Tenant-wallet migration report and write service | `packages/db/src/personal-wallet-migration.ts` |
| Production-compatible migration CLI | `packages/db/src/personal-wallet-migration-cli.ts` |
| Public exports | `packages/db/src/index.ts` |
| Wallet database tests | `packages/db/test/personal-wallet.test.ts` |
| Payment database tests | `packages/db/test/wallet-payments.test.ts` |
| Migration SQL guard tests | `packages/db/test/personal-wallet-migration-sql.test.ts` |
| XunhuPay signing, amount parsing, and HTTP client | `apps/api/src/modules/payments/xunhu.client.ts` |
| Payment request validation | `apps/api/src/modules/payments/payments.schemas.ts` |
| Checkout, callback, query, reconciliation, refund orchestration | `apps/api/src/modules/payments/payments.service.ts` |
| API-only timed reconciliation loop | `apps/api/src/modules/payments/payment-reconciler.ts` |
| User and platform-admin payment routes | `apps/api/src/modules/payments/payments.routes.ts` |
| Personal billing read/redeem API | `apps/api/src/modules/billing/billing.service.ts`, `apps/api/src/modules/billing/billing.routes.ts`, `apps/api/src/modules/billing/billing.schemas.ts` |
| API wiring and environment | `apps/api/src/app.ts`, `apps/api/src/fastify.d.ts`, `apps/api/src/config/env.ts` |
| API tests | `apps/api/test/billing.test.ts`, `apps/api/test/payments.test.ts`, `apps/api/test/workflow-runs.test.ts`, `apps/api/test/workbench.test.ts` |
| Immutable workflow/workbench owner cutover | `apps/api/src/modules/workflow-runs/workflow-runs.service.ts`, `apps/api/src/modules/workbench/workbench.service.ts`, `apps/worker/src/workflow-runtime/service.ts`, `apps/worker/src/workbench/workbench-generation.service.ts` |
| Expiry queue and processor | `packages/redis/src/queues.ts`, `packages/redis/src/index.ts`, `apps/worker/src/processors/wallet-expiry.processor.ts`, `apps/worker/src/queues/registry.ts`, `apps/worker/src/main.ts`, `apps/worker/src/config/env.ts` |
| Personal billing UI | `src/billing/billingApi.ts`, `src/billing/BillingCenterPage.tsx`, `src/billing/BillingSummaryCards.tsx`, `src/billing/RechargePanel.tsx`, `src/billing/PaymentStatusPanel.tsx`, `src/billing/billingActivity.ts` |
| Platform billing administration UI | `src/admin/adminApi.ts`, `src/admin/AdminPage.tsx` |
| Frontend tests | `src/billing/BillingCenterPage.test.tsx`, `src/billing/RechargePanel.test.tsx`, `src/admin/AdminPage.test.tsx` |
| Deployment and operational record | `docker-compose.staging.yml`, `docs/STAGING_ENV_TEMPLATE.md`, `docs/PRODUCTION_DEPLOYMENT.md`, `docs/PRODUCTION_RUNBOOK.md`, `docs/staging-runbook.md`, `PROJECT_RECORD.md` |

### Task 1: Create the personal-wallet schema, plan catalog, ownership columns, and RLS

**Files:**
- Create: `packages/db/migrations/000042_xunhupay_personal_wallet.sql`
- Create: `packages/db/test/personal-wallet-migration-sql.test.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("000042_xunhupay_personal_wallet.sql", () => {
  test("defines user-owned wallet RLS, immutable billing owners, plans, and callback isolation", async () => {
    const sql = await readFile(path.resolve(import.meta.dirname, "../migrations/000042_xunhupay_personal_wallet.sql"), "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS billing_wallets");
    expect(sql).toContain("UNIQUE (user_id)");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS billed_user_id uuid REFERENCES users(id)");
    expect(sql).toContain("user_id = app.current_user_id()");
    expect(sql).toContain("app.current_is_system_admin()");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = pg_catalog, public, app");
    expect(sql).toContain("REVOKE ALL ON FUNCTION app.apply_xunhu_payment_notification");
    expect(sql).toContain("credits_100");
    expect(sql).toContain("credits_3300");
  });
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run: `npm run test --workspace @aigc-flow/db -- personal-wallet-migration-sql.test.ts`

Expected: FAIL with `ENOENT` for `000042_xunhupay_personal_wallet.sql`.

- [ ] **Step 3: Add the migration with explicit constraints and seed data**

Create all six new tables with the exact names below. Add SQL comments documenting why the two platform-global tables and four user-owned tables intentionally omit `tenant_id`:

```sql
billing_wallets
billing_wallet_credit_grants
billing_wallet_ledger
billing_wallet_credit_reservations
billing_recharge_plans
billing_wallet_payments
```

Use `numeric(18,4)` for every credit amount, `bigint` for CNY cents, `UNIQUE (user_id, idempotency_key)` on the wallet ledger, `UNIQUE (user_id, idempotency_key)` and `UNIQUE (merchant_order_id)` on payments, and the following snapshot columns on payments:

```sql
wallet_id uuid NOT NULL REFERENCES billing_wallets(id),
user_id uuid NOT NULL REFERENCES users(id),
plan_id uuid NOT NULL REFERENCES billing_recharge_plans(id),
plan_key text NOT NULL,
merchant_order_id text NOT NULL CHECK (char_length(merchant_order_id) <= 32),
provider text NOT NULL DEFAULT 'xunhupay' CHECK (provider = 'xunhupay'),
provider_transaction_id text,
provider_open_order_id text,
amount_cents bigint NOT NULL CHECK (amount_cents > 0),
credits numeric(18,4) NOT NULL CHECK (credits > 0),
currency text NOT NULL DEFAULT 'CNY' CHECK (currency = 'CNY'),
plan_name_snapshot text NOT NULL,
validity_days_snapshot int NOT NULL CHECK (validity_days_snapshot > 0),
expires_at_snapshot timestamptz,
status text NOT NULL CHECK (status IN ('pending','checkout_created','paid','create_failed','cancelled','refund_pending','refunded','refund_failed')),
billing_ledger_id uuid REFERENCES billing_wallet_ledger(id),
idempotency_key text NOT NULL,
failure_code text,
paid_at timestamptz,
metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
```

Define `billing_wallets` as the unique user aggregate; grants with original/remaining/reserved credits, source type/id, expiry and status; immutable signed wallet ledger entries with optional tenant/workflow/node/usage attribution; and reservation allocation rows linking a reserve ledger entry to each grant. Add checks for the approved source, entry, grant, reservation, and payment states plus indexes for user history, payment status/reconciliation, and FEFO order `expires_at ASC NULLS LAST, created_at ASC, id ASC`.

Define `billing_recharge_plans` with stable key, name, `amount_cents`, `credits`, `currency='CNY'`, `validity_days`, `active`, `sort_order`, metadata, `updated_by`, and timestamps. Plan reads expose only commercial fields through the API; audit metadata and administrator identity remain admin-only.

Add `billed_user_id` to `workflow_runs`, `workbench_generations`, and `usage_events`; backfill workflow/workbench rows from `created_by`, leave historical usage rows nullable, then make the first two columns `NOT NULL` only after reporting any unresolved rows. Add the user-select usage RLS policy while retaining tenant-scoped policies:

```sql
CREATE POLICY usage_events_select_billed_user
  ON usage_events FOR SELECT
  USING (billed_user_id = app.current_user_id());
```

Seed the approved plans with conflict-safe values:

```sql
INSERT INTO billing_recharge_plans (key, name, amount_cents, credits, validity_days, active, sort_order)
VALUES
  ('credits_100', '100 AI credits', 990, 100, 365, true, 10),
  ('credits_700', '700 AI credits', 5000, 700, 365, true, 20),
  ('credits_1500', '1,500 AI credits', 10000, 1500, 365, true, 30),
  ('credits_3300', '3,300 AI credits', 20000, 3300, 365, true, 40)
ON CONFLICT (key) DO NOTHING;
```

Add `billing:plans:manage`, `billing:payments:manage`, and `billing:refund` permissions and grant them only to the global `system_admin` role. Add user-owner and system-admin RLS policies to wallet tables; authenticated users may select active plan commercial fields through API transactions, while writes remain service-controlled.

Define `app.apply_xunhu_payment_notification(p_trade_order_id text, p_amount_cents bigint, p_provider_state text, p_provider_transaction_id text, p_provider_open_order_id text, p_event_time timestamptz)` as `SECURITY DEFINER SET search_path = pg_catalog, public, app`. The function must lock the payment, verify exact cents, perform only compatible state transitions, create the `payment` grant and ledger exactly once for `OD`, set `paid_at` to the committed event time, and set both grant expiry and `expires_at_snapshot` to that time plus `validity_days_snapshot`. It revokes/deducts the grant exactly once for a compatible `CD`. Revoke public execution; the migration owner, which is the configured API database role in this deployment, retains execution.

- [ ] **Step 4: Run migration contract and database integration tests**

Run: `npm run test --workspace @aigc-flow/db -- personal-wallet-migration-sql.test.ts billing.test.ts`

Expected: PASS; database-backed cases may report SKIP only when `DATABASE_URL` is absent.

- [ ] **Step 5: Commit the schema boundary**

```bash
git add packages/db/migrations/000042_xunhupay_personal_wallet.sql packages/db/test/personal-wallet-migration-sql.test.ts packages/db/src/index.ts
git commit -m "feat(db): add personal wallet schema"
```

### Task 2: Implement FEFO personal-wallet reserve, settle, refund, redeem, and expiry

**Files:**
- Create: `packages/db/src/personal-wallet.ts`
- Create: `packages/db/test/personal-wallet.test.ts`
- Modify: `packages/db/src/billing.ts`
- Modify: `packages/db/src/transaction.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write failing wallet behavior tests**

Cover one wallet across two tenants, cross-user denial, FEFO allocation, concurrent idempotency, lazy expiry, settlement, same-grant failure refund, expired-reservation refund, admin grant, and redeem. Use these public signatures in the tests:

```ts
const wallet = new PersonalWalletService({ pool });
await wallet.credit({ userId }, {
  amountCredits: 100,
  expiresAt: "2026-08-01T00:00:00.000Z",
  idempotencyKey: "test:credit:1",
  sourceId: "fixture-1",
  sourceType: "admin_grant",
});
const reserve = await wallet.reserveUsage({ tenantId, userId }, {
  amountCredits: 60,
  idempotencyKey: "test:reserve:1",
  nodeRunId,
  workflowRunId,
});
await wallet.settleUsage({ tenantId, userId }, {
  amountCredits: 60,
  idempotencyKey: "test:settle:1",
  reserveLedgerId: reserve.id,
  usageEventId,
});
```

Assert that reserve calls from different tenants reduce the same `billing_wallets` row and that a second user receives `WALLET_FORBIDDEN` or sees zero rows through RLS.

- [ ] **Step 2: Run the tests and verify missing exports**

Run: `npm run test --workspace @aigc-flow/db -- personal-wallet.test.ts`

Expected: FAIL because `PersonalWalletService` is not exported.

- [ ] **Step 3: Implement the focused wallet service**

Export these stable types and methods:

```ts
export type PersonalWalletContext = { tenantId?: string | null; userId: string };
export type WalletLedgerView = { id: string; userId: string; walletId: string; tenantId: string | null; usageEventId: string | null; entryType: string; amountCredits: number; idempotencyKey: string; createdAt: string };
export type WalletCreditInput = { amountCredits: number; expiresAt: string | null; idempotencyKey: string; sourceId: string; sourceType: "payment" | "redeem" | "admin_grant" | "migration"; metadata?: Record<string, unknown> };
export type WalletReserveInput = { amountCredits: number; idempotencyKey: string; workflowRunId?: string | null; nodeRunId?: string | null; metadata?: Record<string, unknown> };
export type WalletSettleInput = { amountCredits: number; idempotencyKey: string; reserveLedgerId: string; usageEventId: string; metadata?: Record<string, unknown> };
export type WalletRefundInput = { idempotencyKey: string; reserveLedgerId: string; usageEventId?: string | null; metadata?: Record<string, unknown> };
export type WalletSummaryView = {
  availableCredits: number;
  balanceCredits: number;
  expiringSoonCredits: number;
  nearestExpiryAt: string | null;
  reservedCredits: number;
  walletId: string;
};

export class PersonalWalletService {
  getSummary(context: PersonalWalletContext): Promise<WalletSummaryView>;
  listLedger(context: PersonalWalletContext, options?: BillingListOptions): Promise<{items: WalletLedgerView[]; page: number; pageSize: number}>;
  credit(context: {userId: string}, input: WalletCreditInput): Promise<WalletLedgerView>;
  reserveUsage(context: PersonalWalletContext, input: WalletReserveInput): Promise<WalletLedgerView>;
  reserveUsageWithClient(client: PoolClient, context: PersonalWalletContext, input: WalletReserveInput): Promise<WalletLedgerView>;
  settleUsageWithClient(client: PoolClient, context: PersonalWalletContext, input: WalletSettleInput): Promise<WalletLedgerView>;
  refundUsageWithClient(client: PoolClient, context: PersonalWalletContext, input: WalletRefundInput): Promise<WalletLedgerView>;
  expireDueGrants(input?: {limit?: number; now?: string}): Promise<{expiredCredits: number; expiredGrantCount: number}>;
}
```

Add a user-scoped transaction helper for global tables without weakening tenant transactions:

```ts
export type UserDbContext = { tenantId?: string | null; userId: string };
export async function withUserTransaction<T>(ctx: UserDbContext, fn: (client: PoolClient) => Promise<T>, pool?: Pool): Promise<T>;
```

It must set `app.user_id`, set `app.tenant_id` to the supplied tenant or an empty string, and never set `app.is_system_admin`. Verified platform-admin services set the admin flag inside their own transaction after authorization.

Every mutating transaction must lock the wallet, call `expireDueGrantsWithClient` first, allocate active grants by `expires_at ASC NULLS LAST, created_at ASC, id ASC FOR UPDATE`, and persist the exact allocation rows. `refundUsageWithClient` accepts `reserveLedgerId` instead of a client-provided amount. If a source grant is already expired, reduce its reserved amount without restoring wallet availability.

Extend `UsageEventInput`, `UsageEventRecord`, `UsageEventView`, insert/select mapping, and conflict validation in `packages/db/src/billing.ts` with `billedUserId: string`. Move redeem-credit mutation to `PersonalWalletService.redeemCode`; preserve tenant code visibility but enforce one redemption per `(redeem_code_id, user_id)` and write `wallet_ledger_id`.

- [ ] **Step 4: Run wallet and legacy billing tests**

Run: `npm run test --workspace @aigc-flow/db -- personal-wallet.test.ts billing.test.ts`

Expected: PASS with FEFO, expiry, idempotency, and legacy-history assertions green.

- [ ] **Step 5: Commit wallet behavior**

```bash
git add packages/db/src/personal-wallet.ts packages/db/src/billing.ts packages/db/src/transaction.ts packages/db/src/index.ts packages/db/test/personal-wallet.test.ts
git commit -m "feat(db): implement personal wallet accounting"
```

### Task 3: Cut workflow and workbench charging over to immutable billing owners

**Files:**
- Modify: `apps/api/src/modules/workflow-runs/workflow-runs.service.ts`
- Modify: `apps/api/src/modules/workbench/workbench.service.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`
- Modify: `apps/api/test/workflow-runs.test.ts`
- Modify: `apps/api/test/workbench.test.ts`
- Modify: `apps/api/test/admin.test.ts`
- Modify: `apps/worker/src/workflow-runtime/service.ts`
- Modify: `apps/worker/src/workbench/workbench-generation.service.ts`
- Modify: `apps/worker/test/worker.test.ts`
- Modify: `apps/worker/test/workbench-generation.service.test.ts`

- [ ] **Step 1: Add failing API and worker ownership tests**

Add API assertions that user A can reserve in tenant A and tenant B against one wallet, user B cannot spend user A's balance, discounts are applied before reserve, missing pricing remains `PRICING_NOT_FOUND`, and insufficient funds returns HTTP 402 `INSUFFICIENT_BALANCE` without enqueueing. Extend admin tests so grant/adjust operations target a user's global wallet, while membership-tier changes continue to update the tenant billing account because the current discount model remains workspace-specific.

Add a retry test that stores user A as `billed_user_id`, then executes the worker with a different viewer context and proves settle/refund still uses user A:

```ts
expect(personalWalletService.settleUsageWithClient).toHaveBeenCalledWith(
  expect.anything(),
  { tenantId, userId: billedUserId },
  expect.objectContaining({ reserveLedgerId }),
);
```

- [ ] **Step 2: Run focused suites and verify old tenant billing calls fail expectations**

Run: `npm run test --workspace @aigc-flow/api -- workflow-runs.test.ts workbench.test.ts admin.test.ts && npm run test --workspace @aigc-flow/worker -- worker.test.ts workbench-generation.service.test.ts`

Expected: FAIL because services still call tenant `BillingService.reserveUsageWithClient` and records do not return `billedUserId`.

- [ ] **Step 3: Make the ownership cutover in one change**

Inject `PersonalWalletService` into both API creation services, both Worker execution services, and `AdminApiService`. At create time require authenticated `context.userId`, persist it into `workflow_runs.billed_user_id` or `workbench_generations.billed_user_id`, and pass it to every wallet mutation. Keep `tenantId` in reservation/ledger attribution and continue using the existing membership discount calculation. Change administrator credit grants/adjustments and user balance summaries to the target user's global wallet, but leave membership-tier mutation and discount lookup on `billing_accounts`.

Update views with:

```ts
billedUserId: string;
```

When recording usage, call the existing tenant `BillingService.recordUsageEventWithClient` with `billedUserId`; when reserving, settling, cancelling, queue-failing, deleting, or provider-failing, call `PersonalWalletService` with the stored immutable owner. Remove live calls to tenant account reserve/settle/refund from all four services, but leave old ledger read code untouched.

- [ ] **Step 4: Run all affected API and Worker suites**

Run: `npm run test --workspace @aigc-flow/api -- workflow-runs.test.ts workbench.test.ts billing.test.ts admin.test.ts && npm run test --workspace @aigc-flow/worker -- worker.test.ts workbench-generation.service.test.ts`

Expected: PASS; no live generation test updates `billing_accounts`.

- [ ] **Step 5: Commit the atomic charging cutover**

```bash
git add apps/api/src/modules/workflow-runs/workflow-runs.service.ts apps/api/src/modules/workbench/workbench.service.ts apps/api/src/modules/admin/admin.service.ts apps/api/test/workflow-runs.test.ts apps/api/test/workbench.test.ts apps/api/test/admin.test.ts apps/worker/src/workflow-runtime/service.ts apps/worker/src/workbench/workbench-generation.service.ts apps/worker/test/worker.test.ts apps/worker/test/workbench-generation.service.test.ts
git commit -m "feat(billing): charge AI usage to personal wallets"
```

### Task 4: Add dry-run-first tenant balance migration and reconciliation

**Files:**
- Create: `packages/db/src/personal-wallet-migration.ts`
- Create: `packages/db/src/personal-wallet-migration-cli.ts`
- Create: `packages/db/test/personal-wallet-migration.test.ts`
- Modify: `packages/db/package.json`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write failing migration-service tests**

Create fixtures for one owner with two tenants, preserved finite and infinite grant expiry, an ambiguous owner, an active reservation, and a rerun. Assert this shape:

```ts
type PersonalWalletMigrationReport = {
  activeReservationCount: number;
  dryRun: boolean;
  migratedCredits: number;
  migratedGrantCount: number;
  sourceAvailableCredits: number;
  unresolvedTenants: Array<{reason: "missing_owner" | "ambiguous_owner"; tenantId: string}>;
  verificationMatched: boolean;
};
```

Dry-run must produce no rows; write mode must abort globally when `activeReservationCount > 0` or unresolved tenants exist; a second write must report zero new grants and equal totals.

- [ ] **Step 2: Run the migration tests and verify the red state**

Run: `npm run test --workspace @aigc-flow/db -- personal-wallet-migration.test.ts`

Expected: FAIL because `migrateTenantBalancesToPersonalWallets` does not exist.

- [ ] **Step 3: Implement the report, idempotent writes, and compiled CLI**

Export:

```ts
export async function migrateTenantBalancesToPersonalWallets(
  pool: Pool,
  options: { dryRun: boolean },
): Promise<PersonalWalletMigrationReport>;
```

Resolve exactly one active `tenant_owner`, calculate `remaining_credits - reserved_credits` per active unexpired source grant, preserve `expires_at`, and use `migration:tenant-grant:<sourceGrantId>` for both source-derived idempotency and ledger trace metadata. Do not update old accounts, grants, reservations, or ledger rows.

The CLI must require exactly one mode:

```text
node packages/db/dist/personal-wallet-migration-cli.js --dry-run
node packages/db/dist/personal-wallet-migration-cli.js --write --confirm PERSONAL_WALLET_CUTOVER
```

Exit `0` only when verification matches and no unresolved owners or active reservations remain. Exit `1` with a JSON report otherwise. Add package scripts `migrate:personal-wallets:dry-run` and `migrate:personal-wallets:write` for local use.

- [ ] **Step 4: Run tests and build the compiled CLI**

Run: `npm run test --workspace @aigc-flow/db -- personal-wallet-migration.test.ts && npm run build --workspace @aigc-flow/db`

Expected: PASS and `packages/db/dist/personal-wallet-migration-cli.js` exists.

- [ ] **Step 5: Commit migration tooling**

```bash
git add packages/db/src/personal-wallet-migration.ts packages/db/src/personal-wallet-migration-cli.ts packages/db/src/index.ts packages/db/package.json packages/db/test/personal-wallet-migration.test.ts
git commit -m "feat(db): migrate tenant credits to personal wallets"
```

### Task 5: Implement XunhuPay signing, strict currency conversion, and HTTP transport

**Files:**
- Create: `apps/api/src/modules/payments/xunhu.client.ts`
- Create: `apps/api/test/xunhu-client.test.ts`
- Modify: `apps/api/src/config/env.ts`

- [ ] **Step 1: Write failing pure unit tests from the provider rules**

Test ASCII key sorting, omission of `hash` and empty values, lowercase MD5, constant-time verification, strict decimal conversion, signed checkout parsing, signed query/refund requests, timeout classification, and secret redaction.

```ts
expect(parseCnyToCents("9.9")).toBe(990);
expect(() => parseCnyToCents("9.999")).toThrowError("INVALID_CNY_AMOUNT");
expect(signXunhu({ appid: "20190613001", nonce_str: "abc", total_fee: "9.90" }, "secret"))
  .toMatch(/^[a-f0-9]{32}$/);
```

- [ ] **Step 2: Run the unit test and verify missing module failure**

Run: `npm run test --workspace @aigc-flow/api -- xunhu-client.test.ts`

Expected: FAIL because `xunhu.client.ts` does not exist.

- [ ] **Step 3: Implement the dependency-free XunhuPay client**

Export:

```ts
export function signXunhu(fields: Record<string, string | number | null | undefined>, secret: string): string;
export function verifyXunhuSignature(fields: Record<string, string>, secret: string): boolean;
export function parseCnyToCents(value: string): number;
export function centsToCny(cents: number): string;

export type XunhuOrderState = "OD" | "CD" | "RD" | "UD";
export type XunhuCheckoutInput = { merchantOrderId: string; title: string; amountCents: number; attach: string };
export type XunhuCheckoutResult = { checkoutUrl: string; qrCodeUrl: string; openOrderId: string | null };
export type XunhuOrderResult = { merchantOrderId: string; amountCents: number; state: XunhuOrderState; transactionId: string | null; openOrderId: string | null };

export class XunhuPayClient {
  createCheckout(input: XunhuCheckoutInput): Promise<XunhuCheckoutResult>;
  queryOrder(merchantOrderId: string): Promise<XunhuOrderResult>;
  refundOrder(input: {merchantOrderId: string; reason: string}): Promise<XunhuOrderResult>;
}
```

Use injected `fetch`, `AbortSignal.timeout(timeoutMs)`, JSON POSTs to `/payment/do.html`, `/payment/query.html`, and `/payment/refund.html`, and verify response signatures before returning data. Checkout sends `version=1.1`, configured `appid`, `trade_order_id`, cents-derived `total_fee`, title, Unix `time`, configured `notify_url`/`return_url`, a cryptographic `nonce_str`, and `hash`. Never include `appSecret`, `hash` input material, or raw signed payloads in errors.

Extend `ApiEnv` with `paymentsEnabled`, `xunhuAppId`, `xunhuAppSecret`, `xunhuBaseUrl`, `xunhuNotifyUrl`, `xunhuReturnUrl`, `xunhuTimeoutMs`, and `paymentReconcileIntervalMs`. In production, require merchant fields only when `PAYMENTS_ENABLED=true`; default the base URL to `https://api.xunhupay.com` and timeout to `10000`.

- [ ] **Step 4: Run client tests and API typecheck**

Run: `npm run test --workspace @aigc-flow/api -- xunhu-client.test.ts && npm run build --workspace @aigc-flow/api`

Expected: PASS with no secret string in serialized errors.

- [ ] **Step 5: Commit provider transport**

```bash
git add apps/api/src/modules/payments/xunhu.client.ts apps/api/test/xunhu-client.test.ts apps/api/src/config/env.ts
git commit -m "feat(payments): add xunhupay signed client"
```

### Task 6: Implement payment persistence, fixed-plan checkout, signed callback, and user status

**Files:**
- Create: `packages/db/src/wallet-payments.ts`
- Create: `packages/db/test/wallet-payments.test.ts`
- Modify: `packages/db/src/index.ts`
- Create: `apps/api/src/modules/payments/payments.schemas.ts`
- Create: `apps/api/src/modules/payments/payments.service.ts`
- Create: `apps/api/src/modules/payments/payments.routes.ts`
- Create: `apps/api/test/payments.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/fastify.d.ts`
- Modify: `apps/api/src/modules/billing/billing.routes.ts`
- Modify: `apps/api/src/modules/billing/billing.schemas.ts`
- Modify: `apps/api/src/modules/billing/billing.service.ts`

- [ ] **Step 1: Write failing database and API tests**

Cover active-plan listing, inactive rejection, commercial snapshotting, caller ownership, provider create timeout, unknown create outcome retention, desktop/mobile URLs, authenticated payment lookup, form callback parsing, bad signature, wrong app ID, wrong amount, unknown order, unsupported state, conflicting state, duplicate sequential callback, and two concurrent `OD` callbacks creating one grant.

The checkout request must reject old client-controlled fields:

```ts
const response = await api.inject({
  method: "POST",
  url: "/api/v2/billing/payment/create-checkout",
  headers: authHeaders,
  payload: { planKey: "credits_100", idempotencyKey: "checkout:user:1", amountCents: 1, credits: 999999 },
});
expect(response.statusCode).toBe(400);
```

Assert a successful callback body is exactly `success`, content type is `text/plain`, and the response is sent only after the wallet/payment transaction resolves.

- [ ] **Step 2: Run focused tests and verify missing payment service**

Run: `npm run test --workspace @aigc-flow/db -- wallet-payments.test.ts && npm run test --workspace @aigc-flow/api -- payments.test.ts billing.test.ts`

Expected: FAIL because `WalletPaymentService`, payment routes, and `planKey` schema do not exist.

- [ ] **Step 3: Implement payment database operations**

Export `RechargePlanView`, `WalletPaymentView`, and:

```ts
export class WalletPaymentService {
  listActivePlans(context: {userId: string}): Promise<RechargePlanView[]>;
  createPendingPayment(context: {userId: string}, input: {idempotencyKey: string; merchantOrderId: string; planKey: string}): Promise<WalletPaymentView>;
  markCheckoutCreated(input: {paymentId: string; checkoutUrl: string; qrCodeUrl: string}): Promise<WalletPaymentView>;
  getUserPayment(context: {userId: string}, paymentId: string): Promise<WalletPaymentView>;
  applyVerifiedNotification(input: VerifiedXunhuNotification): Promise<{mutated: boolean; payment: WalletPaymentView}>;
}
```

Use this verified notification contract between API signature validation and the database transition:

```ts
export type VerifiedXunhuNotification = {
  amountCents: number;
  eventTime: string;
  merchantOrderId: string;
  openOrderId: string | null;
  providerState: "OD" | "CD" | "RD" | "UD";
  transactionId: string | null;
};
```

`createPendingPayment` resolves the active plan on the server and snapshots amount, credits, name, and validity. Generate merchant IDs as `TF` plus 26 uppercase hex characters, which is unique and at most 28 characters. `applyVerifiedNotification` invokes only `app.apply_xunhu_payment_notification` after API signature/app ID/strict amount checks.

- [ ] **Step 4: Implement bounded form parsing and routes**

Register a 16 KiB `application/x-www-form-urlencoded` parser using `URLSearchParams`; reject duplicate keys and more than 64 fields. Define schemas:

```ts
export const createPaymentCheckoutSchema = z.object({
  planKey: z.string().trim().min(1).max(64),
  idempotencyKey: z.string().trim().min(1).max(255),
}).strict();

export const paymentParamsSchema = z.object({ paymentId: z.string().uuid() });
```

Register:

```text
GET  /api/v2/billing/recharge-plans
POST /api/v2/billing/payment/create-checkout
GET  /api/v2/billing/payments/:paymentId
POST /api/v2/billing/payment/xunhu/notify
```

The first three derive `userId` from auth and never accept an owner ID. The callback route has no auth prehandler, verifies the complete non-empty form field set, resolves ownership only from `trade_order_id`, ignores `attach` for authorization, and returns exact `success` only after `applyVerifiedNotification` commits. Return a non-2xx JSON error without echoing signed fields for every failure.

Guard recharge plans, checkout, payment status, personal summary, personal usage, personal ledger, and redeem with `requireAuth` only so every authenticated user can manage their own wallet regardless of current tenant role. Update those existing billing methods to use the authenticated personal wallet. Summary includes `nearestExpiryAt`; usage listing filters `usage_events.billed_user_id`; ledger lists `billing_wallet_ledger`. Keep `GET /billing/pricing` tenant-scoped with `requireTenant` and `billing:read` because pricing and discounts remain workspace-specific.

- [ ] **Step 5: Run database and API payment suites**

Run: `npm run test --workspace @aigc-flow/db -- wallet-payments.test.ts personal-wallet.test.ts && npm run test --workspace @aigc-flow/api -- payments.test.ts billing.test.ts`

Expected: PASS; duplicate/concurrent callback assertions show one `payment` ledger row and one payment grant.

- [ ] **Step 6: Commit checkout and callback**

```bash
git add packages/db/src/wallet-payments.ts packages/db/src/index.ts packages/db/test/wallet-payments.test.ts apps/api/src/modules/payments apps/api/test/payments.test.ts apps/api/src/app.ts apps/api/src/fastify.d.ts apps/api/src/modules/billing
git commit -m "feat(payments): add xunhupay checkout and callback"
```

### Task 7: Add reconciliation, platform-admin plan management, and eligible full refunds

**Files:**
- Modify: `packages/db/src/wallet-payments.ts`
- Modify: `packages/db/test/wallet-payments.test.ts`
- Modify: `apps/api/src/modules/payments/payments.schemas.ts`
- Modify: `apps/api/src/modules/payments/payments.service.ts`
- Create: `apps/api/src/modules/payments/payment-reconciler.ts`
- Modify: `apps/api/src/modules/payments/payments.routes.ts`
- Modify: `apps/api/test/payments.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/observability/observability.service.ts`
- Modify: `apps/api/test/auth.test.ts`
- Modify: `apps/api/test/audit-observability.test.ts`

- [ ] **Step 1: Add failing state-machine, authorization, audit, and refund tests**

Test `OD -> paid`, `RD -> refund_pending`, `CD -> refunded`, `UD -> refund_failed`; a pending order query; API startup reconciliation with one claimed candidate; tenant admins receiving 403; `system_admin` and configured `admin_email` platform administrators listing payments and changing plans; commercial updates affecting new orders only; eligible full refund; duplicate refund; partially consumed grant rejection; reserved grant rejection; and sanitized audit metadata.

```ts
expect(refundResponse.json().error.code).toBe("PAYMENT_CREDITS_ALREADY_USED");
expect(JSON.stringify(auditRows)).not.toContain(xunhuAppSecret);
```

- [ ] **Step 2: Run the tests and verify the missing admin routes**

Run: `npm run test --workspace @aigc-flow/api -- payments.test.ts`

Expected: FAIL with 404 for `/api/v2/admin/billing/recharge-plans`.

- [ ] **Step 3: Implement plan and payment administration**

Add strict schemas for plan create/update, list filters, `reason`, and UUID params. Require `requireAuth`, `requireTenant`, the matching new permission, and a platform-admin role source (`system_admin` or the existing configured `admin_email`) for every platform billing admin route. Extend the auth service's existing `ADMIN_EMAILS` bootstrap to add the three platform billing permissions alongside `admin:system`; database role grants remain assigned only to `system_admin`. After route authorization, admin database transactions set `app.is_system_admin=true`. Register:

```text
GET    /api/v2/admin/billing/recharge-plans
POST   /api/v2/admin/billing/recharge-plans
PATCH  /api/v2/admin/billing/recharge-plans/:planId
GET    /api/v2/admin/billing/payments
POST   /api/v2/admin/billing/payments/:paymentId/query
POST   /api/v2/admin/billing/payments/:paymentId/refund
```

Plan mutation inputs use integer `amountCents`, positive numeric `credits`, integer `validityDays`, boolean `active`, and integer `sortOrder`. Each mutation writes an audit event with actor, target, before/after values, request ID, and reason; use the request tenant as the existing audit partition and store global target IDs in metadata.

Before calling XunhuPay refund, lock the payment grant and require `remaining_credits = original_credits` and `reserved_credits = 0`. Reuse `refund:<paymentId>` as the provider-call idempotency key. `RD` retains credits and marks `refund_pending`; only `CD` revokes the grant and subtracts it atomically; `UD` retains credits and marks `refund_failed`.

Emit structured, redacted events for checkout outcome, callback signature/app-ID/amount/state rejection, duplicate callback, reconciliation backlog, paid latency, expiry counts, and refund failure. Extend `ObservabilityService.getAdminMetrics` with database-derived `payments.pendingReconciliation`, `payments.paidLast24Hours`, `payments.refundFailuresLast24Hours`, and `payments.averagePaidLatencyMs`; signature rejection remains a structured metric event because an invalid public callback may not identify a safe database order.

- [ ] **Step 4: Implement API-only timed reconciliation**

Create `PaymentReconciler` with `start()` and `stop()` methods. On each interval, acquire PostgreSQL advisory lock `hashtext('tapflow:xunhupay:reconcile')`, claim at most 50 pending/uncertain/refund-pending orders using `FOR UPDATE SKIP LOCKED`, query XunhuPay, and apply the same verified state transition. Register it with Fastify `onReady`/`onClose`; do not run it when `PAYMENTS_ENABLED=false`. A provider query failure records a safe failure code and leaves the order eligible for the next interval; it never creates a replacement merchant order.

- [ ] **Step 5: Run payment and audit tests**

Run: `npm run test --workspace @aigc-flow/api -- payments.test.ts auth.test.ts audit-observability.test.ts`

Expected: PASS with no tenant-admin access and no secret/payload leakage.

- [ ] **Step 6: Commit payment operations**

```bash
git add packages/db/src/wallet-payments.ts packages/db/test/wallet-payments.test.ts apps/api/src/modules/payments apps/api/test/payments.test.ts apps/api/src/app.ts apps/api/src/modules/auth/auth.service.ts apps/api/test/auth.test.ts apps/api/src/modules/observability/observability.service.ts apps/api/test/audit-observability.test.ts
git commit -m "feat(payments): add reconciliation and admin refunds"
```

### Task 8: Add scheduled wallet expiration to Redis and Worker

**Files:**
- Modify: `packages/redis/src/queues.ts`
- Modify: `packages/redis/src/index.ts`
- Modify: `packages/redis/test/redis.test.ts`
- Create: `apps/worker/src/processors/wallet-expiry.processor.ts`
- Modify: `apps/worker/src/queues/registry.ts`
- Modify: `apps/worker/src/main.ts`
- Modify: `apps/worker/src/config/env.ts`
- Modify: `apps/worker/test/worker.test.ts`

- [ ] **Step 1: Write failing queue and processor tests**

Assert `QUEUE_NAMES.walletExpiry === "billing.wallet-expiry"`, payload `{ tenantId: SYSTEM_TENANT_ID }` passes the lightweight guard, worker startup registers one repeatable job, and processing calls `expireDueGrants({limit: 500})`. The integration test must prove two sweeps create one `expire` ledger mutation per grant.

- [ ] **Step 2: Run focused tests and verify missing queue failure**

Run: `npm run test --workspace @aigc-flow/redis -- redis.test.ts && npm run test --workspace @aigc-flow/worker -- worker.test.ts`

Expected: FAIL because `walletExpiry` is absent.

- [ ] **Step 3: Implement and schedule the expiry sweep**

Add `WalletExpiryJobPayload = BaseJobPayload & { limit?: number }`, map it in `QueuePayloadMap`, and register `processWalletExpiryJob`. Add `billingExpirySweepMs` to Worker env with a positive-integer default of `300000`.

At runtime define `const SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000000"`, create the queue, and add:

```ts
await walletExpiryQueue.add(
  "expire-due-wallet-grants",
  { tenantId: SYSTEM_TENANT_ID, limit: 500 },
  { jobId: "wallet-expiry-sweep", repeat: { every: env.billingExpirySweepMs } },
);
```

Use an explicit nil UUID constant for the queue's required `tenantId`; the processor performs global service-controlled expiry and does not use it as wallet ownership. Close the queue during shutdown and emit structured counts without user metadata.

- [ ] **Step 4: Run Redis and Worker tests**

Run: `npm run test --workspace @aigc-flow/redis -- redis.test.ts && npm run test --workspace @aigc-flow/worker -- worker.test.ts`

Expected: PASS; repeat setup and idempotent expiry are green.

- [ ] **Step 5: Commit expiration scheduling**

```bash
git add packages/redis/src/queues.ts packages/redis/src/index.ts packages/redis/test/redis.test.ts apps/worker/src/processors/wallet-expiry.processor.ts apps/worker/src/queues/registry.ts apps/worker/src/main.ts apps/worker/src/config/env.ts apps/worker/test/worker.test.ts
git commit -m "feat(worker): sweep expired wallet grants"
```

### Task 9: Replace the billing page with personal balance, fixed recharge plans, checkout, and polling

**Files:**
- Modify: `src/billing/billingApi.ts`
- Modify: `src/billing/BillingCenterPage.tsx`
- Modify: `src/billing/BillingSummaryCards.tsx`
- Modify: `src/billing/RechargePanel.tsx`
- Create: `src/billing/PaymentStatusPanel.tsx`
- Modify: `src/billing/billingActivity.ts`
- Modify: `src/billing/BillingCenterPage.test.tsx`
- Create: `src/billing/RechargePanel.test.tsx`

- [ ] **Step 1: Write failing personal billing UI tests**

Mock the API and assert the four server plans display as `CNY 9.90 / 100`, `CNY 50.00 / 700`, `CNY 100.00 / 1,500`, and `CNY 200.00 / 3,300`; no hard-coded subscription cards remain; summary shows available/reserved/expiring-soon/nearest-expiry; desktop shows `url_qrcode`; mobile assigns `url`; and `/billing?paymentId=00000000-0000-4000-8000-000000000123` polls a user-owned status until paid, then refreshes summary, usage, and ledger.

Also assert a return URL alone never renders success before `getPayment` returns `paid`, and timers stop after 20 attempts or a terminal state.

- [ ] **Step 2: Run focused frontend tests and verify the old manual checkout shape**

Run: `npm test -- src/billing/BillingCenterPage.test.tsx src/billing/RechargePanel.test.tsx`

Expected: FAIL because checkout still sends `amountCents`/`credits` and the page renders subscription plans.

- [ ] **Step 3: Update API contracts and payment state UI**

Define:

```ts
export type RechargePlan = { id: string; key: string; name: string; amountCents: number; credits: number; validityDays: number };
export type PaymentStatus = "pending" | "checkout_created" | "paid" | "create_failed" | "cancelled" | "refund_pending" | "refunded" | "refund_failed";
export type WalletPayment = { id: string; planKey: string; amountCents: number; credits: number; status: PaymentStatus; checkoutUrl: string | null; qrCodeUrl: string | null; expiresAtSnapshot: string | null };
export const listRechargePlans = () => apiGet<RechargePlan[]>("/billing/recharge-plans");
export const createPaymentCheckout = (input: {planKey: string; idempotencyKey: string}) => apiPost<PaymentCheckoutResponse>("/billing/payment/create-checkout", input);
export const getPayment = (paymentId: string) => apiGet<WalletPayment>(`/billing/payments/${encodeURIComponent(paymentId)}`);
```

`RechargePanel` receives server plans, uses one clear command button per plan, disables duplicate submission, generates one idempotency key per user intent, redirects only on mobile, and shows the QR image only on desktop. `PaymentStatusPanel` maps API states to `confirming`, `paid`, `failed`, and `expired/cancelled`; it does not inspect provider query parameters other than the internal `paymentId`.

Remove workspace identity from the billing page refresh key; use `user.id:sessionId` so switching workspaces does not reset the personal balance owner. Update activity labels for `payment`, `migration_credit`, `admin_credit`, `expire`, and `payment_refund`.

- [ ] **Step 4: Run billing UI tests**

Run: `npm test -- src/billing/BillingCenterPage.test.tsx src/billing/RechargePanel.test.tsx src/billing/billingActivity.test.ts`

Expected: PASS with bounded polling and responsive checkout assertions.

- [ ] **Step 5: Commit the personal billing experience**

```bash
git add src/billing
git commit -m "feat(ui): add personal wallet recharge flow"
```

### Task 10: Add platform-admin plan and payment operations UI

**Files:**
- Modify: `src/admin/adminApi.ts`
- Modify: `src/admin/AdminPage.tsx`
- Modify: `src/admin/AdminPage.test.tsx`

- [ ] **Step 1: Write failing super-admin UI tests**

Assert a super admin can open a `Payment management` tab, edit cents/credits/validity/order/status, list payments with safe IDs/status/amount/user email, trigger query, enter a reason, and request an eligible refund. Assert a tenant admin cannot see the tab and that no response renderer includes `appSecret`, `hash`, a full callback body, or encrypted credentials.

- [ ] **Step 2: Run the admin UI tests and verify the tab is absent**

Run: `npm test -- src/admin/AdminPage.test.tsx`

Expected: FAIL because payment management is not registered.

- [ ] **Step 3: Add typed admin API helpers and unframed admin sections**

Add `AdminRechargePlan`, `AdminWalletPayment`, `list/create/updateAdminRechargePlans`, `listAdminPayments`, `queryAdminPayment`, and `refundAdminPayment`. Extend `OpsTab` with `payments`, mark it `superOnly: true`, and use the page's existing compact section/table patterns. Use integer inputs for cents/days/order and a checkbox for active status; do not use native `<select>`.

Require an explicit non-empty refund reason and disable the refund command unless API eligibility is `eligible`. Refresh plan/payment rows after mutations. Display provider-safe state and redacted identifiers only.

- [ ] **Step 4: Run the admin regression suite**

Run: `npm test -- src/admin/AdminPage.test.tsx`

Expected: PASS; tenant-admin visibility and secret-absence assertions are green.

- [ ] **Step 5: Commit admin payment management**

```bash
git add src/admin/adminApi.ts src/admin/AdminPage.tsx src/admin/AdminPage.test.tsx
git commit -m "feat(admin): manage recharge plans and payments"
```

### Task 11: Wire secure deployment configuration and operational procedures

**Files:**
- Modify: `docker-compose.staging.yml`
- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Modify: `docs/PRODUCTION_DEPLOYMENT.md`
- Modify: `docs/PRODUCTION_RUNBOOK.md`
- Modify: `docs/staging-runbook.md`
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Write a failing configuration regression test**

Add assertions to `apps/api/test/xunhu-client.test.ts` that production startup with `PAYMENTS_ENABLED=true` rejects missing app ID, secret, notify URL, or return URL, while `PAYMENTS_ENABLED=false` starts without merchant credentials.

- [ ] **Step 2: Run the configuration test and verify missing compose wiring**

Run: `npm run test --workspace @aigc-flow/api -- xunhu-client.test.ts`

Expected: FAIL until the final `getApiEnv` validation cases are implemented.

- [ ] **Step 3: Add server-only variables to runtime configuration**

Add these entries to `x-tapflow-env` so the API receives them; the worker receives the shared map but must never read or log the Xunhu values:

```yaml
PAYMENTS_ENABLED: ${PAYMENTS_ENABLED:-false}
XUNHU_APP_ID: ${XUNHU_APP_ID:-}
XUNHU_APP_SECRET: ${XUNHU_APP_SECRET:-}
XUNHU_BASE_URL: ${XUNHU_BASE_URL:-https://api.xunhupay.com}
XUNHU_NOTIFY_URL: ${XUNHU_NOTIFY_URL:-}
XUNHU_RETURN_URL: ${XUNHU_RETURN_URL:-}
XUNHU_TIMEOUT_MS: ${XUNHU_TIMEOUT_MS:-10000}
PAYMENT_RECONCILE_INTERVAL_MS: ${PAYMENT_RECONCILE_INTERVAL_MS:-60000}
BILLING_EXPIRY_SWEEP_MS: ${BILLING_EXPIRY_SWEEP_MS:-300000}
```

Document example values such as `<merchant-app-id>` only, never real secrets. Replace the staging template's old real-payment-disabled declaration with an explicit checklist for credentials, public HTTPS callback reachability, exact `success` acknowledgement, smallest-plan real payment, duplicate callback, personal spending in two workspaces, eligible refund, reconciliation, and secret-free logs.

- [ ] **Step 4: Document the exact cutover sequence**

Use the repository's Compose v2 order and include these commands after backup and migration, with the worker stopped:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-api node packages/db/dist/personal-wallet-migration-cli.js --dry-run
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-api node packages/db/dist/personal-wallet-migration-cli.js --write --confirm PERSONAL_WALLET_CUTOVER
```

State that all owner/reservation exceptions and total mismatches block startup. Start with `PAYMENTS_ENABLED=false`, verify personal reserve/settle/refund in two workspaces, configure server-only merchant values, complete the CNY 9.90 real payment/refund acceptance, then enable payments and recreate the API container. Rollback disables checkout and new generation; after personal charging starts, use a forward fix rather than reverting to tenant charging.

- [ ] **Step 5: Run configuration tests and inspect compose rendering**

Run: `npm run test --workspace @aigc-flow/api -- xunhu-client.test.ts && docker compose --env-file tapflow.staging.env -f docker-compose.staging.yml config --quiet`

Expected: PASS and Compose exits 0 without printing resolved secrets.

- [ ] **Step 6: Commit deployment documentation**

```bash
git add docker-compose.staging.yml docs/STAGING_ENV_TEMPLATE.md docs/PRODUCTION_DEPLOYMENT.md docs/PRODUCTION_RUNBOOK.md docs/staging-runbook.md PROJECT_RECORD.md apps/api/test/xunhu-client.test.ts apps/api/src/config/env.ts
git commit -m "docs: add personal wallet payment cutover runbook"
```

### Task 12: Run full automated verification and focused security checks

**Files:**
- Modify only files required to fix failures introduced by Tasks 1-11; do not refactor unrelated code.

- [ ] **Step 1: Run package builds**

Run: `npm run build --workspace @aigc-flow/db && npm run build --workspace @aigc-flow/redis && npm run build --workspace @aigc-flow/api && npm run build --workspace @aigc-flow/worker && npm run build`

Expected: all five commands exit 0. Existing Browserslist/chunk-size warnings are acceptable; TypeScript errors are not.

- [ ] **Step 2: Run backend and root test suites**

Run: `npm run test --workspace @aigc-flow/db && npm run test --workspace @aigc-flow/api && npm run test --workspace @aigc-flow/worker && npm test`

Expected: PASS; database suites may SKIP only when the test database environment is absent, and that limitation must be recorded before staging.

- [ ] **Step 3: Search for forbidden payment exposure and old live charging calls**

Run:

```bash
rg -n "XUNHU_APP_SECRET|appSecret|rawCallback|signedPayload" src apps/api/src apps/worker/src packages --glob '!apps/api/src/config/env.ts' --glob '!apps/api/src/modules/payments/xunhu.client.ts'
rg -n "billingService\.(reserveUsage|settleUsage|refundUsage)" apps/api/src/modules/workflow-runs apps/api/src/modules/workbench apps/worker/src/workflow-runtime apps/worker/src/workbench
```

Expected: first command finds no frontend/worker secret or raw-payload exposure; second command finds no old tenant-account mutation in live AI execution paths.

- [ ] **Step 4: Run the built migration CLI in dry-run mode against the approved staging snapshot**

Run: `node packages/db/dist/personal-wallet-migration-cli.js --dry-run`

Expected: JSON reports `activeReservationCount: 0`, no unresolved tenants, equal source/migrated totals, and `verificationMatched: true`. Do not run write mode until backup approval and worker shutdown are recorded.

- [ ] **Step 5: Confirm the verification task did not absorb unrelated work**

Run: `git status --short`

Expected: only intentional personal-wallet files from a failing check may be modified. Return any required fix to the task that introduced it, rerun that task's focused test and commit step, then repeat Steps 1-4. If no fix is needed, record `No verification-fix commit required` in `PROJECT_RECORD.md` during Task 13.

### Task 13: Complete staging acceptance and record evidence

**Files:**
- Modify: `PROJECT_RECORD.md`
- Modify: `docs/CODEX_HANDOFF.md`
- Modify: `docs/staging-runbook.md`

- [ ] **Step 1: Execute the safe deployment order with payments disabled**

Build images, stop the Worker, back up PostgreSQL, run `node packages/db/dist/cli.js`, run personal-wallet migration dry-run, resolve every exception, run confirmed write mode, and start Redis/API/Worker/frontend using `docker-compose.staging.yml`. Keep `PAYMENTS_ENABLED=false` for this step.

- [ ] **Step 2: Verify personal charging before opening checkout**

Using one user who belongs to two workspaces, run one priced AI operation in each. Expected: both reserve/settle entries share one `walletId` and `billedUserId`, retain distinct `tenantId` attribution, apply each workspace's current membership discount, and leave no old tenant account mutations.

- [ ] **Step 3: Execute the smallest real payment acceptance**

Set the approved merchant environment values, rebuild/recreate only the API container, enable payments, and buy `credits_100` for CNY 9.90. Expected: XunhuPay sends a valid `OD`, API returns exact `success`, one payment grant of 100 credits receives the order's 365-day snapshot, duplicate notification creates no second grant, and `/billing` changes from confirming to paid by API polling.

- [ ] **Step 4: Verify reconciliation, expiration snapshot, and eligible full refund**

Trigger admin query for the paid order, confirm provider/local states agree, verify nearest expiry and expiring-soon summary, then refund a second completely unused CNY 9.90 order. Expected: `RD` preserves credits while pending; `CD` creates one negative `payment_refund` entry, revokes the grant, and marks the order refunded. Verify a partially used order returns `PAYMENT_CREDITS_ALREADY_USED`.

- [ ] **Step 5: Record sanitized acceptance evidence**

Append the deployed commit, migration totals, service status, test commands, internal payment IDs, callback/reconciliation/refund outcomes, and log-redaction result to `PROJECT_RECORD.md`, `docs/CODEX_HANDOFF.md`, and the staging runbook checklist. Record no merchant secret, signature, Authorization header, full callback body, database password, or personal access token.

- [ ] **Step 6: Commit the acceptance record**

```bash
git add PROJECT_RECORD.md docs/CODEX_HANDOFF.md docs/staging-runbook.md
git commit -m "docs: record xunhupay wallet acceptance"
```

## Acceptance Traceability

| Approved requirement | Implemented and verified in |
| --- | --- |
| One global wallet per `user_id` | Tasks 1-3, 9, 13 |
| Initiating user is immutable billing owner | Tasks 1 and 3 |
| Existing tenant discount before personal debit | Tasks 3 and 13 |
| Four server-owned fixed plans | Tasks 1, 6, and 9 |
| Admin-managed plan validity affecting new orders only | Tasks 6, 7, and 10 |
| Signed XunhuPay checkout/query/refund | Tasks 5-7 |
| Form callback and exact post-commit `success` | Task 6 |
| Exactly-once valid `OD` credit | Tasks 1 and 6 |
| `OD/CD/RD/UD` state mapping | Tasks 6 and 7 |
| FEFO allocation and same-grant failure release | Task 2 |
| Lazy and scheduled expiry | Tasks 2 and 8 |
| No user self-service refund | Tasks 6, 7, and 9 |
| Full admin refund only when entirely unused/unreserved | Tasks 7, 10, and 13 |
| Idempotent owner migration preserving expiry and old history | Task 4 |
| Personal summary, activity, responsive QR/redirect, bounded polling | Task 9 |
| RLS isolation and platform-admin authorization | Tasks 1, 2, 6, and 7 |
| Server-only secrets, observability, deployment, rollback | Tasks 5, 7, 11-13 |
