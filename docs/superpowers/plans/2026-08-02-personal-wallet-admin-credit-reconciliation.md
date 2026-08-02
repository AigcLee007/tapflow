# Personal Wallet Admin Credit Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the personal wallet the only spendable credit balance, move administrator grants and deductions onto the target user's wallet, reconcile post-cutover legacy administrator entries without double-crediting, and show one consistent balance in every UI.

**Architecture:** Extend the existing `PersonalWalletService` with administrator-safe debit and batch-summary operations, then cut `AdminApiService` and its read model away from tenant billing. Add a guarded, idempotent reconciliation CLI that maps legacy ledger/grant provenance into wallet ledger entries while preserving expiration and exact debit allocations. Keep legacy tables immutable, use the flat v2 billing summary contract everywhere, and deploy through a frozen-write maintenance window.

**Tech Stack:** PostgreSQL migrations and RLS, TypeScript, `pg`, Fastify 5, Zod 4, React 19, Vitest, Docker Compose v2.

**Design:** `docs/superpowers/specs/2026-08-02-personal-wallet-admin-credit-reconciliation-design.md`

---

## File Structure

### Database Domain

- Create `packages/db/migrations/000061_wallet_admin_debit.sql`: permit the new immutable wallet ledger entry type and add fixed `SECURITY DEFINER` administrator credit/debit functions with runtime-role ACLs.
- Modify `packages/db/src/personal-wallet.ts`: add client-scoped administrator credit/debit wrappers and single/batch summary operations.
- Modify `packages/db/src/index.ts`: export new wallet input/result types and reconciliation APIs.
- Create `packages/db/src/admin-wallet-reconciliation.ts`: discover, validate, dry-run, and apply legacy administrator wallet corrections.
- Create `packages/db/src/admin-wallet-reconciliation-cli.ts`: enforce dry-run/write command syntax and confirmation token.
- Modify `packages/db/package.json`: expose local development reconciliation commands.
- Create `packages/db/test/admin-wallet-adjustment.test.ts`: focused migration/service behavior tests.
- Create `packages/db/test/admin-wallet-reconciliation.test.ts`: focused report, idempotency, expiry, allocation, and fail-closed tests.

### API And Admin Read Model

- Modify `apps/api/src/modules/admin/admin.service.ts`: mutate target personal wallets and return user-level wallet summaries/ledger.
- Modify `apps/api/src/modules/admin/admin.routes.ts`: keep the permission-protected user-targeted routes wired to the new service.
- Modify `apps/api/src/modules/billing/billing.routes.ts`: remove the obsolete tenant-account adjustment route.
- Modify `apps/api/src/modules/billing/billing.schemas.ts`: remove the obsolete adjustment schema/type.
- Modify `apps/api/src/modules/billing/billing.service.ts`: remove `adjustBillingAccount` and its legacy mutation dependency.
- Modify `apps/api/test/admin.test.ts`: prove target ownership, global wallet behavior, debit rules, and consistent admin/user summaries.
- Modify `apps/api/test/admin-redeem-scope.test.ts`: remove the obsolete `BillingService` constructor fixture after the admin service cutover.
- Modify `apps/api/test/billing-routes-personal-wallet.test.ts`: prove no legacy billing adjustment route remains.
- Modify `apps/api/test/billing-personal-wallet.service.test.ts`: prove the billing service exposes only personal-wallet balance mutations.

### Frontend

- Modify `src/billing/billingApi.ts`: retain one strict flat `BillingSummary` contract.
- Modify `src/billing/billingDisplay.ts`: remove nested legacy fallbacks.
- Modify `src/billing/useBillingSummarySnapshot.ts`: expose shared status/refresh behavior and cross-surface invalidation.
- Create `src/billing/useBillingSummarySnapshot.test.tsx`: test auth, mutation, visibility refresh triggers and unavailable state.
- Modify `src/billing/BillingCenterPage.tsx`: consume the shared summary snapshot and invalidate it after wallet mutations.
- Modify `src/app/WorkspaceShell.tsx`: consume the strict shared snapshot.
- Modify `src/workbench/WorkbenchPage.tsx`: consume the strict shared snapshot.
- Modify `src/workbench/WorkbenchMobileShell.tsx`: accept and render an unavailable balance without coercing it to zero.
- Modify `src/flowCanvas/canvas/FlowTopToolbar.tsx`: read `availableCredits` and render unavailable state instead of false zero.
- Modify corresponding tests under `src/billing`, `src/app`, `src/workbench`, and `src/flowCanvas/canvas`.
- Modify `src/admin/adminApi.ts`: model a user-level personal wallet separately from memberships.
- Modify `src/admin/AdminPage.tsx`: label and render the personal wallet once per user.
- Modify `src/admin/AdminPage.test.tsx`: verify global wallet presentation and mutation refresh.
- Modify `src/services/accountService.ts`: remove the unused legacy tenant-account adjustment client.

### Operations

- Modify `docs/staging-runbook.md`, `docs/PRODUCTION_DEPLOYMENT.md`, and `docs/PRODUCTION_RUNBOOK.md`: add the compiled reconciliation commands and frozen-write sequence.
- Modify `PROJECT_RECORD.md`: record source completion and, separately after deployment, the actual dry-run/write/smoke evidence.

---

### Task 1: Add The Wallet Administrator Mutation Schema Contract

**Files:**
- Create: `packages/db/migrations/000061_wallet_admin_debit.sql`
- Create: `packages/db/test/admin-wallet-adjustment.test.ts`

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("wallet administrator adjustment migration", () => {
  test("adds guarded administrator wallet functions without weakening ACLs", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000061_wallet_admin_debit.sql"),
      "utf8",
    );
    for (const entryType of [
      "payment", "migration_credit", "admin_credit", "admin_debit", "redeem",
      "reserve", "settle", "refund", "expire", "payment_refund",
    ]) {
      expect(sql).toContain(`'${entryType}'`);
    }
    expect(sql).toContain("billing_wallet_ledger_entry_type_check");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.wallet_admin_credit");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.wallet_admin_debit");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("app.current_is_system_admin()");
    expect(sql).toContain("SET LOCAL ROLE tapflow_wallet_callback");
    expect(sql).toContain("creditGrantAllocations");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION app.wallet_admin_credit");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION app.wallet_admin_debit");
    expect(sql).toContain("REVOKE ALL ON FUNCTION app.wallet_admin_credit");
    expect(sql).toContain("REVOKE ALL ON FUNCTION app.wallet_admin_debit");
    expect(sql).not.toContain("DISABLE ROW LEVEL SECURITY");
  });
});
```

- [ ] **Step 2: Run the test and verify the missing migration failure**

Run: `npm run test --workspace @aigc-flow/db -- admin-wallet-adjustment.test.ts`

Expected: FAIL with `ENOENT` for `000061_wallet_admin_debit.sql`.

- [ ] **Step 3: Add the forward-only constraint and fixed mutation functions**

```sql
ALTER TABLE billing_wallet_ledger
  DROP CONSTRAINT IF EXISTS billing_wallet_ledger_entry_type_check;

ALTER TABLE billing_wallet_ledger
  ADD CONSTRAINT billing_wallet_ledger_entry_type_check CHECK (entry_type IN (
    'payment', 'migration_credit', 'admin_credit', 'admin_debit', 'redeem',
    'reserve', 'settle', 'refund', 'expire', 'payment_refund'
  ));
```

In the same migration, create these exact function contracts:

```sql
app.wallet_admin_credit(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_expires_at timestamptz,
  p_idempotency_key text,
  p_source_id text,
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)

app.wallet_admin_debit(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
```

Both functions are owned by the existing non-login `tapflow_wallet_callback` role, use `SECURITY DEFINER SET search_path = pg_catalog, public, app`, and require `app.current_is_system_admin()`. When `app.current_user_id()` is non-null (the API path), require it to equal `p_actor_user_id`; the offline reconciliation path may preserve a historical actor while its current user setting is null. They take `pg_advisory_xact_lock(hashtextextended('wallet-admin:' || p_idempotency_key, 0))` and search all `admin_credit`/`admin_debit` wallet rows for the supplied key before mutation. An exact retry returns the existing row; a different target, tenant, direction, amount, source, or expiration raises `WALLET_IDEMPOTENCY_CONFLICT`.

`wallet_admin_credit` creates/locks the target wallet, inserts one `admin_credit` row with `tenant_id`, inserts one `admin_grant` batch with `created_by = p_actor_user_id` and the exact expiry, then increments the wallet balance. `wallet_admin_debit` expires due target grants first, locks the wallet and active grants in `expires_at ASC NULLS LAST, created_at ASC, id ASC` order, rejects an amount above `balance_credits - reserved_credits`, consumes only `remaining_credits - reserved_credits`, stores positive absolute `amount_credits` plus exact `creditGrantAllocations`, and leaves reservations unchanged.

Use the existing temporary role-membership pattern to `SET LOCAL ROLE tapflow_wallet_callback` for function creation, then `RESET ROLE` and revoke that temporary membership. Revoke both functions from `PUBLIC`, resolve the runtime role with the existing `app.api_database_role`/`session_user` pattern from `000046_wallet_runtime_acl.sql`, and grant only `EXECUTE` to that role. Do not grant direct wallet-table writes to the API role.

- [ ] **Step 4: Run the focused test**

Run: `npm run test --workspace @aigc-flow/db -- admin-wallet-adjustment.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the schema contract**

```bash
git add packages/db/migrations/000061_wallet_admin_debit.sql packages/db/test/admin-wallet-adjustment.test.ts
git commit -m "feat(db): add wallet admin mutation functions"
```

### Task 2: Implement Personal Wallet Administrator Mutations

**Files:**
- Modify: `packages/db/src/personal-wallet.ts:7-114`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/test/admin-wallet-adjustment.test.ts`

- [ ] **Step 1: Add failing service tests for target credit, debit, idempotency, and reservations**

Add a database-backed test using `hasDatabaseEnv()` and `withDatabase()` that:

```ts
const wallet = new PersonalWalletService({ pool });
const credit = await withSystemAdminTransaction(pool, tenantId, adminActorUserId, (client) =>
  wallet.adminCreditWithClient(client, { actorUserId: adminActorUserId, tenantId, userId }, {
  amountCredits: 100,
  description: "Administrator grant",
  expiresAt: "2030-01-01T00:00:00.000Z",
  idempotencyKey: "admin-credit:1",
  sourceId: "admin-credit:1",
  metadata: { adminActorUserId, targetUserId: userId, tenantId },
  }),
);
const creditRetry = await withSystemAdminTransaction(pool, tenantId, adminActorUserId, (client) =>
  wallet.adminCreditWithClient(client, { actorUserId: adminActorUserId, tenantId, userId }, {
    amountCredits: 100,
    description: "Administrator grant",
    expiresAt: "2030-01-01T00:00:00.000Z",
    idempotencyKey: "admin-credit:1",
    sourceId: "admin-credit:1",
    metadata: { adminActorUserId, targetUserId: userId, tenantId },
  }),
);
expect(creditRetry.id).toBe(credit.id);
const reserve = await wallet.reserveUsage({ tenantId, userId }, {
  amountCredits: 30,
  idempotencyKey: "reserve:1",
});
const debit = await withSystemAdminTransaction(pool, tenantId, adminActorUserId, (client) =>
  wallet.adminDebitWithClient(client, { actorUserId: adminActorUserId, tenantId, userId }, {
    amountCredits: 60,
    description: "Administrator debit",
    idempotencyKey: "admin-debit:1",
    metadata: { adminActorUserId, reason: "correction" },
  }),
);
expect(debit.entryType).toBe("admin_debit");
expect(debit.amountCredits).toBe(60);
const grantCount = await withSystemAdminTransaction(pool, tenantId, adminActorUserId, (client) =>
  client.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM billing_wallet_credit_grants WHERE user_id = $1::uuid AND source_type = 'admin_grant'",
    [userId],
  ),
);
expect(grantCount.rows[0]?.count).toBe(1);
const concurrentCredits = await Promise.all([
  withSystemAdminTransaction(pool, tenantId, adminActorUserId, (client) =>
    wallet.adminCreditWithClient(client, { actorUserId: adminActorUserId, tenantId, userId }, {
      amountCredits: 25, description: "Concurrent retry", expiresAt: null,
      idempotencyKey: "admin-credit:concurrent", sourceId: "admin-credit:concurrent",
    })),
  withSystemAdminTransaction(pool, tenantId, adminActorUserId, (client) =>
    wallet.adminCreditWithClient(client, { actorUserId: adminActorUserId, tenantId, userId }, {
      amountCredits: 25, description: "Concurrent retry", expiresAt: null,
      idempotencyKey: "admin-credit:concurrent", sourceId: "admin-credit:concurrent",
    })),
]);
expect(new Set(concurrentCredits.map((entry) => entry.id)).size).toBe(1);
expect(await wallet.getSummary({ userId })).toMatchObject({
  availableCredits: 35,
  balanceCredits: 65,
  reservedCredits: 30,
});
```

Continue the test with these conflict and insufficient-balance calls:

```ts
await expect(withSystemAdminTransaction(pool, tenantId, adminActorUserId, (client) =>
  wallet.adminCreditWithClient(client, { actorUserId: adminActorUserId, tenantId, userId }, {
    amountCredits: 101,
    description: "Conflicting amount",
    expiresAt: "2030-01-01T00:00:00.000Z",
    idempotencyKey: "admin-credit:1",
    sourceId: "admin-credit:1",
  }),
)).rejects.toMatchObject({ code: "WALLET_IDEMPOTENCY_CONFLICT" });

await expect(withSystemAdminTransaction(pool, tenantId, adminActorUserId, (client) =>
  wallet.adminCreditWithClient(client, { actorUserId: adminActorUserId, tenantId, userId }, {
    amountCredits: 100,
    description: "Conflicting expiry",
    expiresAt: "2031-01-01T00:00:00.000Z",
    idempotencyKey: "admin-credit:1",
    sourceId: "admin-credit:1",
  }),
)).rejects.toMatchObject({ code: "WALLET_IDEMPOTENCY_CONFLICT" });

await expect(withSystemAdminTransaction(pool, tenantId, adminActorUserId, (client) =>
  wallet.adminDebitWithClient(client, { actorUserId: adminActorUserId, tenantId, userId }, {
    amountCredits: 100,
    description: "Conflicting direction",
    idempotencyKey: "admin-credit:1",
  }),
)).rejects.toMatchObject({ code: "WALLET_IDEMPOTENCY_CONFLICT" });

await expect(withSystemAdminTransaction(pool, tenantId, adminActorUserId, (client) =>
  wallet.adminCreditWithClient(client, { actorUserId: adminActorUserId, tenantId, userId: otherUserId }, {
    amountCredits: 100,
    description: "Conflicting target",
    expiresAt: "2030-01-01T00:00:00.000Z",
    idempotencyKey: "admin-credit:1",
    sourceId: "admin-credit:1",
  }),
)).rejects.toMatchObject({ code: "WALLET_IDEMPOTENCY_CONFLICT" });

await expect(withSystemAdminTransaction(pool, tenantId, adminActorUserId, (client) =>
  wallet.adminDebitWithClient(client, { actorUserId: adminActorUserId, tenantId, userId }, {
    amountCredits: 61,
    description: "Conflicting retry",
    idempotencyKey: "admin-debit:1",
    metadata: { adminActorUserId, reason: "conflicting retry" },
  }),
)).rejects.toMatchObject({ code: "WALLET_IDEMPOTENCY_CONFLICT" });

await expect(withSystemAdminTransaction(pool, tenantId, adminActorUserId, (client) =>
  wallet.adminDebitWithClient(client, { actorUserId: adminActorUserId, tenantId, userId }, {
    amountCredits: 36,
    description: "Too large",
    idempotencyKey: "admin-debit:2",
    metadata: { adminActorUserId, reason: "too large" },
  }),
)).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
```

Define the test helper so it exercises production RLS:

```ts
async function withSystemAdminTransaction<T>(
  pool: Pool,
  tenantId: string,
  actorUserId: string,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [actorUserId]);
    await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
```

Add an owner-context assertion that a different user cannot select the target wallet, grants, or ledger rows and cannot execute either administrator mutation function, while a system-admin transaction can inspect and mutate the target rows.

- [ ] **Step 2: Run the service test and verify the missing method failure**

Run: `npm run test --workspace @aigc-flow/db -- admin-wallet-adjustment.test.ts`

Expected: FAIL because `adminDebitWithClient` is not defined.

- [ ] **Step 3: Add exact public types and client-scoped signatures**

```ts
export type WalletAdminDebitInput = {
  amountCredits: number;
  description: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

export type WalletAdminCreditInput = {
  amountCredits: number;
  description: string;
  expiresAt: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  sourceId: string;
};

export type WalletSummaryMap = Map<string, WalletSummaryView>;

class PersonalWalletService {
  adminCreditWithClient(
    client: PoolClient,
    context: { actorUserId: string | null; tenantId: string; userId: string },
    input: WalletAdminCreditInput,
  ): Promise<WalletLedgerView>;
  adminDebitWithClient(
    client: PoolClient,
    context: { actorUserId: string | null; tenantId: string; userId: string },
    input: WalletAdminDebitInput,
  ): Promise<WalletLedgerView>;
  getSummaryWithClient(client: PoolClient, userId: string): Promise<WalletSummaryView>;
  getSummariesWithClient(client: PoolClient, userIds: string[]): Promise<WalletSummaryMap>;
}
```

Export `WalletAdminCreditInput`, `WalletAdminDebitInput`, and `WalletSummaryMap` from `packages/db/src/index.ts`.

- [ ] **Step 4: Implement the fixed-function wrappers and error mapping**

Call only the migration-owned functions; do not issue direct `INSERT`/`UPDATE` statements from the runtime service:

```ts
async adminCreditWithClient(client, context, input): Promise<WalletLedgerView> {
  if (!Number.isFinite(input.amountCredits) || input.amountCredits <= 0) {
    throw new PersonalWalletServiceError("INVALID_WALLET_CREDIT", "Credit amount must be positive");
  }
  try {
    const result = await client.query<LedgerRow>(
      `SELECT * FROM app.wallet_admin_credit(
        $1::uuid, $2::uuid, $3::uuid, $4::numeric, $5::timestamptz,
        $6, $7, $8, $9::jsonb
      )`,
      [context.actorUserId, context.userId, context.tenantId, input.amountCredits,
       input.expiresAt, input.idempotencyKey, input.sourceId, input.description,
       JSON.stringify(input.metadata ?? {})],
    );
    if (!result.rows[0]) throw new Error("empty administrator credit");
    return mapLedger(result.rows[0]);
  } catch (error) {
    throw this.mapDatabaseError(error, "WALLET_ADMIN_CREDIT_FAILED", "Unable to credit personal wallet");
  }
}

async adminDebitWithClient(client, context, input): Promise<WalletLedgerView> {
  if (!Number.isFinite(input.amountCredits) || input.amountCredits <= 0) {
    throw new PersonalWalletServiceError("INVALID_WALLET_DEBIT", "Debit amount must be positive");
  }
  try {
    const result = await client.query<LedgerRow>(
      `SELECT * FROM app.wallet_admin_debit(
        $1::uuid, $2::uuid, $3::uuid, $4::numeric, $5, $6, $7::jsonb
      )`,
      [context.actorUserId, context.userId, context.tenantId, input.amountCredits,
       input.idempotencyKey, input.description, JSON.stringify(input.metadata ?? {})],
    );
    if (!result.rows[0]) throw new Error("empty administrator debit");
    return mapLedger(result.rows[0]);
  } catch (error) {
    throw this.mapDatabaseError(error, "WALLET_ADMIN_DEBIT_FAILED", "Unable to debit personal wallet");
  }
}
```

Pass `context.actorUserId` to the SQL actor argument and `context.tenantId` into the ledger attribution column, validate finite positive amounts before the call, map `WALLET_IDEMPOTENCY_CONFLICT` to HTTP-ready status `409`, and map `INSUFFICIENT_BALANCE` to status `402`. The database functions remain the atomic mutation boundary.

- [ ] **Step 5: Implement single and batch summaries without N+1 queries**

Make `getSummary` delegate to `getSummaryWithClient`. Use one `billing_wallets LEFT JOIN billing_wallet_credit_grants` query filtered by `wallet.user_id = ANY($1::uuid[])`. Return zero summaries for requested users with no wallet and calculate `availableCredits = max(balance - reserved, 0)`.

- [ ] **Step 6: Run DB tests and build**

Run:

```bash
npm run test --workspace @aigc-flow/db -- admin-wallet-adjustment.test.ts personal-wallet.test.ts
npm run build --workspace @aigc-flow/db
```

Expected: PASS; database-backed cases may SKIP only when no test database is configured.

- [ ] **Step 7: Commit the wallet operations**

```bash
git add packages/db/src/personal-wallet.ts packages/db/src/index.ts packages/db/test/admin-wallet-adjustment.test.ts
git commit -m "feat(billing): add personal wallet admin adjustments"
```

### Task 3: Cut Administrator Mutations Over To The Target Wallet

**Files:**
- Modify: `apps/api/src/modules/admin/admin.service.ts:572-908`
- Modify: `apps/api/src/modules/billing/billing.routes.ts:139-171`
- Modify: `apps/api/src/modules/billing/billing.schemas.ts:13-22`
- Modify: `apps/api/src/modules/billing/billing.service.ts:38-162`
- Modify: `apps/api/test/admin.test.ts:321-470,1267-1323`
- Modify: `apps/api/test/admin-redeem-scope.test.ts`
- Modify: `apps/api/test/billing-routes-personal-wallet.test.ts`
- Modify: `apps/api/test/billing-personal-wallet.service.test.ts`
- Modify: `src/services/accountService.ts`

- [ ] **Step 1: Rewrite the API integration expectation before implementation**

In the administrator integration test, assert the target user's personal summary and actor isolation:

```ts
async function getSummary(api: ReturnType<typeof buildTestApp>, accessToken: string) {
  const response = await api.inject({
    headers: { authorization: `Bearer ${accessToken}` },
    method: "GET",
    url: "/api/v2/billing/summary",
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

expect((await getSummary(api, targetUser.accessToken)).balanceCredits).toBe(0);
expect((await getSummary(api, adminLogin.json().accessToken)).balanceCredits).toBe(0);
```

Redeem 1,000 as the target user, grant 2,000 through the administrator endpoint, then add 100 through the manual-adjustment endpoint. Require the target's summary and the administrator user detail to both report 3,100 while the actor's wallet remains unchanged. In a separate debit case, reserve part of the target balance through a real workflow or wallet fixture, subtract only from unreserved credits, and require an excessive subtraction to return `402` with `INSUFFICIENT_BALANCE`.

Give the target active memberships in two workspaces, obtain authenticated tenant contexts for both, and require `/api/v2/billing/summary` to return the same `walletId` and 3,100 balance in each workspace. Assert the administrator ledger row keeps only the selected workspace as `tenantId` attribution.

Change the route contract test to:

```ts
expect(routes.some((route) => route.url === "/api/v2/billing/admin/adjust")).toBe(false);
```

- [ ] **Step 2: Run the focused API tests and verify they fail against tenant billing**

Run:

```bash
npm run test --workspace @aigc-flow/api -- admin.test.ts billing-routes-personal-wallet.test.ts billing-personal-wallet.service.test.ts
```

Expected: FAIL because administrator mutations still call `BillingService` and the obsolete route remains registered.

- [ ] **Step 3: Replace the legacy billing dependency with `PersonalWalletService`**

Add:

```ts
readonly personalWalletService: PersonalWalletService;

constructor(options?: {
  personalWalletService?: PersonalWalletService;
  pool?: PgPool;
}) {
  this.pool = options?.pool ?? createPgPool();
  this.personalWalletService = options?.personalWalletService ?? new PersonalWalletService({ pool: this.pool });
}
```

Remove the `BillingService` import, field, and constructor option, and update `admin-redeem-scope.test.ts` to instantiate with only its pool fixture. Preserve the route's existing administrator authorization before opening the wallet transaction. In one system-admin transaction, require `tenant_memberships.status = 'active'`, then call `adminCreditWithClient(client, { actorUserId: context.userId, tenantId: input.tenantId, userId: input.targetUserId }, ...)` for grants/additions or `adminDebitWithClient(...)` for subtraction. Metadata must retain actor, target, tenant, reason, validity, expiry, and the administrator request idempotency key.

- [ ] **Step 4: Return the target wallet summary**

Before committing the same transaction, load the target summary with `getSummaryWithClient(client, input.targetUserId)` and replace the tenant `account` response with:

```ts
{
  wallet: targetWalletSummary,
  ledgerEntry,
}
```

Map wallet ledger fields as `amountCredits`, not legacy `amountCents`.

- [ ] **Step 5: Remove the obsolete tenant adjustment route and client**

Delete `/api/v2/billing/admin/adjust`, `adminAdjustBillingSchema`, `AdminAdjustBillingInput`, `BillingApiService.adjustBillingAccount`, the legacy `BillingService.creditAccount`/`debitAccount` methods once the administrator service no longer references them, and the unused `adjustBillingAccount` export in `src/services/accountService.ts`. Do not replace this route with a second compatibility write path.

- [ ] **Step 6: Run focused API tests and builds**

Run:

```bash
npm run test --workspace @aigc-flow/api -- admin.test.ts billing-routes-personal-wallet.test.ts billing-personal-wallet.service.test.ts
npm run build --workspace @aigc-flow/api
```

Expected: PASS.

- [ ] **Step 7: Commit the API cutover**

```bash
git add apps/api/src/modules/admin/admin.service.ts apps/api/src/modules/billing/billing.routes.ts apps/api/src/modules/billing/billing.schemas.ts apps/api/src/modules/billing/billing.service.ts apps/api/test/admin.test.ts apps/api/test/admin-redeem-scope.test.ts apps/api/test/billing-routes-personal-wallet.test.ts apps/api/test/billing-personal-wallet.service.test.ts src/services/accountService.ts
git commit -m "fix(billing): route admin credits to personal wallets"
```

### Task 4: Move Administrator Balance Reads To The User Level

**Files:**
- Modify: `apps/api/src/modules/admin/admin.service.ts:149-190,387-429,584-680,2161-2295`
- Modify: `apps/api/test/admin.test.ts`
- Modify: `src/admin/adminApi.ts:3-70`
- Modify: `src/admin/AdminPage.tsx:287-306,471-507,810-875,990-1014`
- Modify: `src/admin/AdminPage.test.tsx`

- [ ] **Step 1: Add failing API and UI assertions**

Define the intended response shape in tests:

```ts
expect(user).toMatchObject({
  wallet: {
    availableCredits: 3100,
    balanceCredits: 3100,
    reservedCredits: 0,
  },
});
expect(user.memberships[0]).not.toHaveProperty("balanceCredits");
```

In the UI test, render a user with two memberships and one wallet, then assert that `3,100` appears as the personal wallet balance and is not summed twice.

- [ ] **Step 2: Run focused tests and verify the tenant-shaped failures**

Run:

```bash
npm run test --workspace @aigc-flow/api -- admin.test.ts
npx vitest --run src/admin/AdminPage.test.tsx
```

Expected: FAIL because balances are still membership-scoped.

- [ ] **Step 3: Introduce the user-level wallet view**

```ts
export type AdminUserWalletView = WalletSummaryView & {
  activeCreditGrantCount: number;
  creditGrantCount: number;
  creditLedger: Array<{
    amountCredits: number;
    createdAt: string;
    description: string | null;
    direction: "credit" | "debit";
    entryType: string;
    id: string;
  }>;
  totalGrantedCredits: number;
};

export type AdminUserView = {
  createdAt: string;
  displayName: string | null;
  email: string;
  emailVerifiedAt: string | null;
  id: string;
  lastLoginAt: string | null;
  memberships: AdminUserMembershipView[];
  status: string;
  wallet: AdminUserWalletView;
};
```

Remove spendable balance and wallet-ledger fields from `AdminUserMembershipView`; retain membership tier, role, status, and workspace usage. The membership query may keep a read-only `billing_accounts` join for `membership_tier` and `membership_tier_expires_at` because those fields are still the membership contract, but it must not select or calculate `balance_cents`, `reserved_cents`, or tenant grant totals.

- [ ] **Step 4: Batch-load wallet summaries and ledger rows by user**

Use `getSummariesWithClient(client, userIds)` plus one wallet ledger query with `ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC)`. Limit the change log to balance-changing types (`payment`, `migration_credit`, `admin_credit`, `admin_debit`, `redeem`, `settle`, `expire`, `payment_refund`), classify `admin_debit`/`settle`/`expire`/`payment_refund` as debit, and expose `Math.abs(amountCredits)` because direction is modeled separately. Query grant counts and totals by `user_id`, not `tenant_id`; `nearestExpiryAt` comes from `WalletSummaryView`. Attach the resulting wallet once in `mapUser`.

- [ ] **Step 5: Update frontend types and presentation**

Change `AdminUser` to include:

```ts
export type AdminCreditLedgerEntry = {
  amountCredits: number;
  createdAt: string;
  description: string | null;
  direction: "credit" | "debit";
  entryType: string;
  id: string;
};

wallet: {
  activeCreditGrantCount: number;
  availableCredits: number;
  balanceCredits: number;
  creditGrantCount: number;
  expiringSoonCredits: number;
  nearestExpiryAt: string | null;
  reservedCredits: number;
  totalGrantedCredits: number;
  walletId: string;
  creditLedger: AdminCreditLedgerEntry[];
};
```

Use `user.wallet.availableCredits` in lists and totals, `selectedUser.wallet.balanceCredits` in the detail metric labeled `个人钱包余额`, `selectedUser.wallet.nearestExpiryAt` for expiry, and `selectedUser.wallet.creditLedger` for the change log. Keep `selectedMembership` only for role, tier, workspace usage, and mutation attribution.

Render the user-level wallet metrics whenever `selectedUser` exists. When no active membership is selected, keep wallet history visible but disable workspace-scoped grant, debit, role, and tier controls with the existing membership-required state; do not hide the personal wallet behind `selectedMembership`.

Capture the mutation response and patch the selected user's `wallet` immediately before the background `loadUsers()` refresh:

```ts
const result = await grantAdminCredits({
  credits: Number.parseInt(grantCreditsValue, 10) || 0,
  reason: grantReason,
  targetUserId: selectedUser.id,
  tenantId: selectedMembership.tenantId,
  validityMode: grantValidity.mode,
  validityMonths: "months" in grantValidity ? grantValidity.months : undefined,
});
setUsers((current) => current.map((user) =>
  user.id === selectedUser.id ? { ...user, wallet: result.wallet } : user
));
invalidateBillingSummary();
void loadUsers();
```

Use the same response-first update for positive and negative manual adjustments.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm run test --workspace @aigc-flow/api -- admin.test.ts
npx vitest --run src/admin/AdminPage.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the administrator read model**

```bash
git add apps/api/src/modules/admin/admin.service.ts apps/api/test/admin.test.ts src/admin/adminApi.ts src/admin/AdminPage.tsx src/admin/AdminPage.test.tsx
git commit -m "fix(admin): display personal wallet balances"
```

### Task 5: Build The Guarded Legacy Administrator Reconciler

**Files:**
- Create: `packages/db/src/admin-wallet-reconciliation.ts`
- Create: `packages/db/test/admin-wallet-reconciliation.test.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write failing report and idempotency tests**

Create fixtures for:

```ts
const expectedAccount = {
  email: "aigclee@sina.com",
  tenantIds: [tenantId],
  openingCredits: 1000,
  creditCredits: 2100,
  debitCredits: 0,
  expiredCredits: 0,
  expectedCredits: 3100,
  unresolvedCount: 0,
};
```

Cover these cases in separate tests:

- the initial `migration:tenant-grant:${grantId}` marker excludes a source grant;
- three post-cutover credits produce +2,100 and preserve their individual expirations;
- affected users include every source `tenantId`, while initial-cutover rows increment `alreadyMigratedCount`;
- dry-run rolls back all writes;
- write mode inserts stable `wallet-reconcile:admin:${legacyLedgerId}` keys;
- a second write reports zero pending rows;
- expired credits do not increase the expected closing balance;
- a debit maps every `creditGrantAllocations` source grant to a destination wallet grant;
- missing target, source grant, allocation, or available destination amount produces `unresolved` and blocks write mode.

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npm run test --workspace @aigc-flow/db -- admin-wallet-reconciliation.test.ts`

Expected: FAIL because `admin-wallet-reconciliation.ts` does not exist.

- [ ] **Step 3: Define exact reconciliation types**

```ts
export type AdminWalletReconciliationIssue = {
  legacyLedgerId: string;
  tenantId: string | null;
  userId: string | null;
  reason:
    | "missing_target_user"
    | "missing_tenant_attribution"
    | "missing_source_grant"
    | "missing_cutover_marker"
    | "missing_allocations"
    | "missing_destination_grant"
    | "insufficient_destination_grant";
};

export type AdminWalletReconciliationUser = {
  creditCredits: number;
  debitCredits: number;
  email: string;
  expectedCredits: number;
  expiredCredits: number;
  openingCredits: number;
  tenantIds: string[];
  unresolvedCount: number;
  userId: string;
};

export type AdminWalletReconciliationReport = {
  alreadyMigratedCount: number;
  alreadyReconciledCount: number;
  cutoverAt: string | null;
  dryRun: boolean;
  expiredCreditCount: number;
  issues: AdminWalletReconciliationIssue[];
  pendingCreditCount: number;
  pendingDebitCount: number;
  runId: string;
  sourceNetCredits: number;
  destinationNetCredits: number;
  users: AdminWalletReconciliationUser[];
  verificationMatched: boolean;
};
```

- [ ] **Step 4: Implement source discovery and fail-closed validation**

Use a repeatable-read transaction and `set_config('app.is_system_admin', 'true', true)`. Derive the cutover watermark from the earliest committed `migration_credit` wallet ledger timestamp and emit `missing_cutover_marker` when no marker exists. Restrict both legacy credit and debit discovery to rows after that watermark. Join legacy credit ledger rows to legacy grants through `billing_credit_grants.source_id = billing_ledger.idempotency_key`. Parse UUIDs and numeric values explicitly; never coerce missing metadata to a tenant owner.

Credit discovery requires `billing_ledger.entry_type = 'admin_credit'`, a valid `metadata.targetUserId`, a non-null source tenant, the linked legacy grant, no initial migration marker, and no destination reconciliation key. Debit discovery requires `billing_ledger.entry_type = 'admin_debit'`, the same target/tenant validation, complete numeric `creditGrantAllocations`, creation after the watermark, and no destination reconciliation key. Any missing tenant attribution is `missing_tenant_attribution` and blocks write mode.

Exclude initial migrations by checking ``migration:tenant-grant:${legacyGrantId}`` and increment `alreadyMigratedCount`; exclude completed reconciliation by checking ``wallet-reconcile:admin:${legacyLedgerId}`` for the target user and increment `alreadyReconciledCount`. Collect the distinct source `tenant_id` values into each user's sorted `tenantIds` report field.

- [ ] **Step 5: Implement exact credit and debit application**

For each unexpired credit, call `adminCreditWithClient` with the historical actor when valid (otherwise `null`) and the source tenant attribution:

```ts
await wallet.adminCreditWithClient(
  client,
  { actorUserId: legacyActorUserId, tenantId: legacyTenantId, userId: targetUserId },
  {
    amountCredits: legacyAmount,
    description: legacyDescription ?? "Reconciled legacy administrator credit",
    expiresAt: legacyGrant.expiresAt,
    idempotencyKey: `wallet-reconcile:admin:${legacyLedgerId}`,
    sourceId: legacyLedgerId,
    metadata: {
      adminActorUserId: legacyActorUserId,
      legacyBillingLedgerId: legacyLedgerId,
      legacyCreditGrantId: legacyGrant.id,
      legacyOperationAt,
      originalIdempotencyKey: legacyIdempotencyKey,
      reconciliationRunId: runId,
      targetUserId,
      tenantId: legacyTenantId,
    },
  },
);
```

For debit rows, map each legacy allocation to the wallet grant whose metadata contains the same `migrationSourceGrantId` or `legacyCreditGrantId`. Lock those destination grants, validate their unreserved amounts, reduce exactly those grants, decrement the wallet balance, and insert one positive-amount `admin_debit` ledger row with the stable reconciliation key and mapped allocations.

Compute every issue and projected allocation before mutation. For each user, define `expectedCredits = openingCredits + creditCredits - debitCredits`. Define `sourceNetCredits` as the sum of pending unexpired legacy credits minus pending applicable legacy debits, and `destinationNetCredits` as the sum of the exact simulated wallet balance deltas. Set `verificationMatched` only when every user's projected closing balance equals `expectedCredits`, both net totals match to four decimal places, and `issues.length === 0`.

In dry-run mode, execute the validated application path and roll the transaction back. In write mode, acquire `SHARE ROW EXCLUSIVE` locks on `billing_ledger`, `billing_credit_grants`, `billing_wallets`, `billing_wallet_credit_grants`, and `billing_wallet_ledger`; throw before applying any row when `verificationMatched` is false; otherwise apply and commit. Expired credit rows increment `expiredCreditCount`/`expiredCredits`, are excluded from pending counts and net totals, and receive no destination mutation.

- [ ] **Step 6: Run reconciliation and wallet tests**

Run:

```bash
npm run test --workspace @aigc-flow/db -- admin-wallet-reconciliation.test.ts admin-wallet-adjustment.test.ts personal-wallet.test.ts
npm run build --workspace @aigc-flow/db
```

Expected: PASS.

- [ ] **Step 7: Commit the reconciler**

```bash
git add packages/db/src/admin-wallet-reconciliation.ts packages/db/src/index.ts packages/db/test/admin-wallet-reconciliation.test.ts
git commit -m "feat(billing): reconcile legacy admin wallet entries"
```

### Task 6: Add The Reconciliation CLI And Operational Commands

**Files:**
- Create: `packages/db/src/admin-wallet-reconciliation-cli.ts`
- Modify: `packages/db/package.json`
- Modify: `packages/db/test/admin-wallet-reconciliation.test.ts`
- Modify: `docs/staging-runbook.md`
- Modify: `docs/PRODUCTION_DEPLOYMENT.md`
- Modify: `docs/PRODUCTION_RUNBOOK.md`

- [ ] **Step 1: Add failing CLI mode parser tests**

```ts
expect(parseAdminWalletReconciliationMode(["--dry-run"])).toEqual({ dryRun: true });
expect(parseAdminWalletReconciliationMode([
  "--write", "--confirm", "ADMIN_WALLET_RECONCILIATION",
])).toEqual({ dryRun: false });
expect(parseAdminWalletReconciliationMode(["--write"])).toBeNull();
```

- [ ] **Step 2: Run the parser test and verify it fails**

Run: `npm run test --workspace @aigc-flow/db -- admin-wallet-reconciliation.test.ts`

Expected: FAIL because the parser/CLI is absent.

- [ ] **Step 3: Implement the guarded CLI**

```ts
export function parseAdminWalletReconciliationMode(args: string[]): { dryRun: boolean } | null {
  if (args.length === 1 && args[0] === "--dry-run") return { dryRun: true };
  if (args.length === 3 && args[0] === "--write" && args[1] === "--confirm" && args[2] === "ADMIN_WALLET_RECONCILIATION") {
    return { dryRun: false };
  }
  return null;
}
```

The CLI prints exactly one JSON report, exits nonzero when `verificationMatched` is false or issues are present, and always closes the pool.

- [ ] **Step 4: Add package scripts**

```json
"reconcile:admin-wallets:dry-run": "tsx src/admin-wallet-reconciliation-cli.ts --dry-run",
"reconcile:admin-wallets:write": "tsx src/admin-wallet-reconciliation-cli.ts --write --confirm ADMIN_WALLET_RECONCILIATION"
```

- [ ] **Step 5: Document compiled production commands**

Add these commands to all three runbooks after the migration step and before restarting API/Worker:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/admin-wallet-reconciliation-cli.js --dry-run
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/admin-wallet-reconciliation-cli.js --write --confirm ADMIN_WALLET_RECONCILIATION
```

State that `tapflow-api` and `tapflow-worker` must both be stopped before the schema migration and remain stopped through dry-run review, write mode, and the idempotency dry-run. Document the required pre-change database snapshot/control totals, the stop condition on any nonempty `issues` or mismatched total, and rollback rules: redeploy the previous application revision for code failure; never delete successful wallet ledger rows; use a new audited reversal entry for any financial correction.

- [ ] **Step 6: Run DB tests/build and inspect compiled output**

Run:

```bash
npm run test --workspace @aigc-flow/db -- admin-wallet-reconciliation.test.ts
npm run build --workspace @aigc-flow/db
Test-Path packages/db/dist/admin-wallet-reconciliation-cli.js
```

Expected: tests PASS, build PASS, `Test-Path` prints `True`.

- [ ] **Step 7: Commit CLI and runbooks**

```bash
git add packages/db/src/admin-wallet-reconciliation-cli.ts packages/db/package.json packages/db/test/admin-wallet-reconciliation.test.ts docs/staging-runbook.md docs/PRODUCTION_DEPLOYMENT.md docs/PRODUCTION_RUNBOOK.md
git commit -m "docs(billing): add admin wallet reconciliation runbook"
```

### Task 7: Make The Flat Billing Summary Contract Strict And Refreshable

**Files:**
- Modify: `src/billing/billingDisplay.ts:1-20`
- Modify: `src/billing/useBillingSummarySnapshot.ts`
- Create: `src/billing/useBillingSummarySnapshot.test.tsx`
- Modify: `src/billing/RedeemCodeBox.tsx`
- Modify: `src/billing/RedeemCodeBox.test.tsx`

- [ ] **Step 1: Write failing strict-contract and refresh tests**

```ts
expect(getAvailableCredits({
  availableCredits: 3100,
  balanceCredits: 3100,
  expiringSoonCredits: 0,
  nearestExpiryAt: null,
  reservedCredits: 0,
  walletId: "wallet-1",
})).toBe(3100);
```

For the hook, mock `getBillingSummary` and `getStoredAccessToken`, render a probe, dispatch the exported invalidation event, `V2_AUTH_CHANGE_EVENT`, and a visible `visibilitychange`, and expect a refetch for each event. Clear the token and dispatch `V2_AUTH_CHANGE_EVENT`; assert `status === "disabled"` with `summary === null`. Restore the token, reject the API call, and assert `status === "error"` with `summary === null`.

- [ ] **Step 2: Run focused tests and verify missing refresh/status behavior**

Run:

```bash
npx vitest --run src/billing/billingActivity.test.ts src/billing/useBillingSummarySnapshot.test.tsx src/billing/RedeemCodeBox.test.tsx
```

Expected: FAIL because the hook has no status/invalidation API.

- [ ] **Step 3: Remove legacy summary fallbacks**

```ts
export function getAvailableCredits(summary: BillingSummary | null): number | null {
  return summary ? Math.max(summary.availableCredits, 0) : null;
}
```

Remove all `summary.account` and `summary.creditGrants` access from the frontend.

- [ ] **Step 4: Implement the shared snapshot contract**

```ts
export const BILLING_SUMMARY_INVALIDATE_EVENT = "v2-billing-summary-invalidate";
export type BillingSummarySnapshot = {
  refresh: () => Promise<void>;
  status: "disabled" | "loading" | "ready" | "error";
  summary: BillingSummary | null;
};
export function invalidateBillingSummary(): void {
  window.dispatchEvent(new Event(BILLING_SUMMARY_INVALIDATE_EVENT));
}
```

Have `useBillingSummarySnapshot(enabled)` return `BillingSummarySnapshot`, ignore stale responses with a request counter, and refresh on auth change, invalidation, and visibility regain. It must never replace an API failure with a numeric zero.

Treat `enabled` as whether the surface wants billing data and gate the actual request with `Boolean(getStoredAccessToken())`. Subscribe once to `V2_AUTH_CHANGE_EVENT`, the invalidation event, `storage`, and `visibilitychange`; increment an internal refresh revision on each applicable event. On logout, increment the request counter, clear the summary, and set `disabled` so an older in-flight request cannot repopulate the prior user's balance.

- [ ] **Step 5: Invalidate after redeem success**

Call `invalidateBillingSummary()` after `redeemBillingCode` resolves and before invoking the page callback.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest --run src/billing/useBillingSummarySnapshot.test.tsx src/billing/RedeemCodeBox.test.tsx src/billing/billingActivity.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the shared billing snapshot**

```bash
git add src/billing/billingDisplay.ts src/billing/useBillingSummarySnapshot.ts src/billing/useBillingSummarySnapshot.test.tsx src/billing/RedeemCodeBox.tsx src/billing/RedeemCodeBox.test.tsx
git commit -m "fix(billing): enforce flat wallet summary contract"
```

### Task 8: Update Every Balance Surface

**Files:**
- Modify: `src/billing/BillingCenterPage.tsx`
- Modify: `src/billing/BillingCenterPage.test.tsx`
- Modify: `src/app/WorkspaceShell.tsx`
- Modify: `src/app/WorkspaceShell.test.tsx`
- Modify: `src/workbench/WorkbenchPage.tsx`
- Modify: `src/workbench/WorkbenchPage.test.tsx`
- Modify: `src/workbench/WorkbenchMobileShell.tsx`
- Create: `src/workbench/WorkbenchMobileShell.test.tsx`
- Modify: `src/flowCanvas/canvas/FlowTopToolbar.tsx:18,86-128,430-433`
- Modify: `src/flowCanvas/canvas/FlowTopToolbar.test.tsx`
- Modify: `src/flowCanvas/runtime/v2WorkflowRunner.ts:173-190`
- Modify: `src/flowCanvas/runtime/v2WorkflowRunner.test.ts`

- [ ] **Step 1: Replace old mocks with the real flat response and add 3,100 assertions**

Use this fixture in every affected test:

```ts
const walletSummary = {
  availableCredits: 3100,
  balanceCredits: 3100,
  expiringSoonCredits: 0,
  nearestExpiryAt: null,
  reservedCredits: 0,
  walletId: "wallet-1",
};
```

For `FlowTopToolbar`, make `getStoredAccessToken` return a token, resolve the real flat summary, and assert the current-points button contains `3,100`. Add a rejected-summary test asserting `--` and not `0`.
For `WorkbenchMobileShell`, render `availableCredits: null` and assert its balance test id contains `--`; render `3,100` and assert the same surface updates without changing its layout.

- [ ] **Step 2: Run all affected frontend tests and verify failures**

Run:

```bash
npx vitest --run src/billing/BillingCenterPage.test.tsx src/app/WorkspaceShell.test.tsx src/workbench/WorkbenchPage.test.tsx src/workbench/WorkbenchMobileShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts
```

Expected: FAIL at old hook return shapes and the toolbar's `data.account.balanceCents` access.

- [ ] **Step 3: Update each consumer**

Destructure the shared result in billing, workspace, workbench, and toolbar consumers (the toolbar calls the hook with `true` and relies on its token gate):

```ts
const { summary: billingSummary, status: billingStatus } = useBillingSummarySnapshot(enabled);
const availableCredits = getAvailableCredits(billingSummary);
```

Delete `getBillingSummary` and the legacy `data.account.balanceCents` read from `FlowTopToolbar.tsx`; the hook's `status` controls loading/error/unavailable rendering and its `summary.availableCredits` supplies the number.

Render `availableCredits?.toLocaleString() ?? "--"`. In the workbench/canvas preflight helpers, use only top-level `availableCredits`, `balanceCredits`, and `reservedCredits`; delete nested fallbacks.

Change the mobile workbench `availableCredits` prop to `number | null` and render `availableCredits?.toLocaleString() ?? "--"`. Change `getMembershipLabel` to accept its own `MembershipTier | undefined` type instead of indexing the removed `BillingSummary.membership`; until authentication exposes a tier, call it without a billing-summary field.

Move `BillingCenterPage` summary fetching to the shared hook while leaving usage, ledger, and recharge-plan loading in its existing page refresh. After payment settlement, call both page refresh and `invalidateBillingSummary()`.

- [ ] **Step 4: Update the toolbar test mock and error behavior**

Replace:

```ts
{ account: { balanceCents: 0 } }
```

with the flat `walletSummary` fixture. Assert API failure produces `--` and a retry/focus refresh can recover to `3,100`.

- [ ] **Step 5: Run affected frontend tests and focused typecheck**

Run:

```bash
npx vitest --run src/billing/BillingCenterPage.test.tsx src/app/WorkspaceShell.test.tsx src/workbench/WorkbenchPage.test.tsx src/workbench/WorkbenchMobileShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts
npx tsc --noEmit --pretty false --skipLibCheck --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 --allowJs --allowImportingTsExtensions src/billing/billingDisplay.ts src/billing/useBillingSummarySnapshot.ts src/flowCanvas/canvas/FlowTopToolbar.tsx src/flowCanvas/runtime/v2WorkflowRunner.ts
```

Expected: PASS with no `BillingSummary` nested-field errors.

- [ ] **Step 6: Commit the creator surfaces**

```bash
git add src/billing/BillingCenterPage.tsx src/billing/BillingCenterPage.test.tsx src/app/WorkspaceShell.tsx src/app/WorkspaceShell.test.tsx src/workbench/WorkbenchPage.tsx src/workbench/WorkbenchPage.test.tsx src/workbench/WorkbenchMobileShell.tsx src/workbench/WorkbenchMobileShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts
git commit -m "fix(ui): unify personal wallet balance displays"
```

### Task 9: Run End-To-End Source Verification And Record Completion

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run focused database and API suites**

```bash
npm run test --workspace @aigc-flow/db -- admin-wallet-adjustment.test.ts admin-wallet-reconciliation.test.ts personal-wallet.test.ts
npm run test --workspace @aigc-flow/api -- admin.test.ts billing-routes-personal-wallet.test.ts billing-personal-wallet.service.test.ts
```

Expected: PASS; report exact database-backed skips if local infrastructure is absent.

- [ ] **Step 2: Run Worker regression tests**

Run: `npm run test --workspace @aigc-flow/worker`

Expected: PASS; no reserve/settle/refund regression.

- [ ] **Step 3: Run frontend tests**

```bash
npx vitest --run src/admin/AdminPage.test.tsx src/billing/BillingCenterPage.test.tsx src/billing/useBillingSummarySnapshot.test.tsx src/app/WorkspaceShell.test.tsx src/workbench/WorkbenchPage.test.tsx src/workbench/WorkbenchMobileShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run required builds**

```bash
npm run build --workspace @aigc-flow/db
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/worker
npm run build
```

Expected: PASS. Record warnings separately; do not describe a timed-out or skipped command as passing.

- [ ] **Step 5: Run the full root suite**

Run: `npm test`

Expected: PASS, or document only failures proven unrelated to this billing cutover using `docs/CODEX_HANDOFF.md` and focused passing evidence.

- [ ] **Step 6: Update the project record**

Add a dated entry to `PROJECT_RECORD.md` containing:

```md
- cut administrator credit/debit mutations and administrator balance reads over to the personal wallet;
- added the guarded legacy administrator reconciliation dry-run/write tooling with preserved expiry and stable ledger idempotency;
- removed the legacy tenant billing adjustment route and nested frontend billing-summary fallbacks;
- recorded every source validation command with its observed pass, fail, and skip counts;
- staging reconciliation and 3,100-credit acceptance remain pending deployment.
```

Replace the generic validation-summary sentence with the exact observed command results before committing; do not claim skipped or timed-out commands passed.

- [ ] **Step 7: Commit source verification evidence**

```bash
git add PROJECT_RECORD.md
git commit -m "docs: record personal wallet credit cutover"
```

### Task 10: Perform Staging Reconciliation And Acceptance

**Files:**
- Modify after successful staging work: `PROJECT_RECORD.md`

- [ ] **Step 1: Back up PostgreSQL and capture pre-change control totals**

On a trusted host with PostgreSQL client tools and access to the staging env file:

```bash
set -a
. /opt/aittco/env/tapflow.staging.env
set +a
umask 077
install -d -m 700 /opt/aittco/backups/tapflow
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
pg_dump --dbname="$MIGRATION_DATABASE_URL" --format=custom --file="/opt/aittco/backups/tapflow/pre-admin-wallet-${backup_stamp}.dump"
pg_restore --list "/opt/aittco/backups/tapflow/pre-admin-wallet-${backup_stamp}.dump" >/dev/null
psql "$MIGRATION_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SELECT COALESCE(SUM(balance_credits), 0) AS wallet_balance_credits, COALESCE(SUM(reserved_credits), 0) AS wallet_reserved_credits FROM billing_wallets" -c "SELECT entry_type, COUNT(*) AS entry_count, COALESCE(SUM(amount_cents), 0) AS amount_credits FROM billing_ledger WHERE entry_type IN ('admin_credit', 'admin_debit') GROUP BY entry_type ORDER BY entry_type" > "/opt/aittco/backups/tapflow/pre-admin-wallet-${backup_stamp}.control-totals.txt"
```

Expected: `pg_restore --list` exits zero, both files exist with mode `600` or stricter, and the backup identifier/control totals are recorded before deployment. If host tools are unavailable, create and verify a provider-managed snapshot and record its identifier instead; do not continue without one recoverable backup.

- [ ] **Step 2: Build images using the v2 compose path**

```bash
cd /opt/aittco/tapflow
git fetch --all --prune
git pull --ff-only origin main
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build
```

Expected: all v2 images build successfully.

- [ ] **Step 3: Freeze every billing writer**

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-api tapflow-worker
```

Expected: API and Worker are stopped before schema or data mutation.

- [ ] **Step 4: Run the compiled schema migration**

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/cli.js
```

Expected: migration `000061_wallet_admin_debit.sql` is recorded exactly once.

- [ ] **Step 5: Run and review reconciliation dry-run**

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/admin-wallet-reconciliation-cli.js --dry-run
```

Expected: `verificationMatched=true`, `issues=[]`, and `aigclee@sina.com` reports opening 1,000, credit 2,100, expected 3,100. Stop here if any value differs.

- [ ] **Step 6: Run confirmed reconciliation and prove rerun idempotency**

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/admin-wallet-reconciliation-cli.js --write --confirm ADMIN_WALLET_RECONCILIATION
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-migrator node packages/db/dist/admin-wallet-reconciliation-cli.js --dry-run
```

Expected: write succeeds; second dry-run reports zero pending credits/debits and unchanged totals.

- [ ] **Step 7: Start v2 services and inspect health/logs**

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml ps
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml logs --tail=100 tapflow-api tapflow-worker
```

Expected: all services healthy with no wallet permission, RLS, idempotency, or reconciliation errors.

- [ ] **Step 8: Perform authenticated UI and generation smoke tests**

Using `aigclee@sina.com`, verify `/billing`, account menu, canvas toolbar, and administrator user detail all show 3,100. Run one minimum-cost real generation and verify reserve then settle reduce the same personal wallet once; on a forced failure, verify refund releases the reservation.

- [ ] **Step 9: Record staging evidence without rewriting financial history**

Add the exact migration id, dry-run/write JSON totals, service status, UI observations, and generation ledger ids to `PROJECT_RECORD.md`. If correction is required, create a new reversal entry; do not delete or update successful wallet ledger rows.

- [ ] **Step 10: Commit the staging record**

```bash
git add PROJECT_RECORD.md
git commit -m "docs: record admin wallet reconciliation acceptance"
```
