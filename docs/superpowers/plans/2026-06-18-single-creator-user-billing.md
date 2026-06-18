# Single-Creator User Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn auth/account/admin/billing into a production-oriented single-creator SaaS model with hidden tenant IDs, platform user management, expiring credit batches, and membership-tier generation discounts.

**Architecture:** Keep tenants as backend isolation boundaries but remove them from normal user-facing UI. Add credit-grant batches as the source of truth for spendable credits while keeping `billing_accounts` as a summary/cache. Apply membership discounts at task creation before reserve, and persist original/discounted cost metadata through reserve, settle, and refund.

**Tech Stack:** Vite, React, TypeScript, Fastify, PostgreSQL migrations/RLS, `@aigc-flow/db`, Vitest, existing v2 auth/billing/workbench/workflow APIs.

---

## File Structure

- Modify `src/auth/LoginPage.tsx`: remove tenant ID UI and login payload.
- Modify `src/auth/AuthPages.test.tsx`: assert login only asks for email/password.
- Modify `src/account/AccountPage.tsx`: replace internal diagnostic cards with creator-facing account summary.
- Modify `src/account/AccountPage.test.tsx`: assert internal IDs/roles/permissions are hidden and membership data is shown.
- Modify `src/billing/billingApi.ts`: add membership and credit-batch summary response types.
- Modify `src/billing/BillingSummaryCards.tsx`: display available, reserved, expiring-soon, lifetime, and discount.
- Modify `src/billing/BillingCenterPage.test.tsx`: cover new summary fields.
- Modify `packages/db/migrations/000029_single_creator_billing.sql`: add membership fields and credit grants/allocation tables with RLS.
- Modify `packages/db/src/billing.ts`: implement credit grants, discounted reserve metadata, grant allocation reserve/settle/refund, and summary batch fields.
- Modify `packages/db/test/billing.test.ts`: cover grant FIFO, lifetime last, expiry exclusion, migration grant, and membership discounts.
- Modify `apps/api/src/modules/billing/billing.service.ts`: expose new summary fields.
- Modify `apps/api/src/modules/admin/admin.schemas.ts`: add tier update and grant-credit validity schemas.
- Modify `apps/api/src/modules/admin/admin.service.ts`: make admin user search platform-scoped; add tier update; add expiring grant issuance.
- Modify `apps/api/src/modules/admin/admin.routes.ts`: add admin tier and grant endpoints.
- Modify `apps/api/test/admin.test.ts`: cover global user search, tier override, expiring credit grant, and non-admin denial.
- Modify `apps/api/src/modules/workbench/workbench.service.ts`: apply membership discount and reserve grant allocations.
- Modify `apps/api/test/workbench-service.test.ts`: cover discounted reserve.
- Modify `apps/api/src/modules/workflow-runs/workflow-runs.service.ts`: apply membership discount and reserve grant allocations for canvas runs.
- Modify `apps/api/test/workflow-runs.test.ts` or existing workflow-runs test file: cover discounted node reserve and missing pricing behavior.
- Modify `apps/worker/src/workbench/workbench-generation.service.ts`: settle/refund against reserved grant allocations via billing service metadata.
- Modify `apps/worker/src/workflow-runtime/service.ts`: settle/refund against reserved grant allocations via billing service metadata.
- Modify `src/admin/adminApi.ts` and `src/admin/AdminPage.tsx`: show platform user management, membership tier controls, and credit validity grant controls.
- Modify `src/admin/AdminPage.test.tsx` if present, otherwise create it.
- Modify `PROJECT_RECORD.md`: record the completed account/admin/billing architecture improvement after implementation.

## Task 1: Hide Tenant From Login and Account UI

**Files:**
- Modify: `src/auth/LoginPage.tsx`
- Modify: `src/auth/AuthPages.test.tsx`
- Modify: `src/account/AccountPage.tsx`
- Modify: `src/account/AccountPage.test.tsx`

- [ ] **Step 1: Write failing login UI test**

Add or update a test in `src/auth/AuthPages.test.tsx`:

```tsx
it("does not ask creators for a tenant id on login", () => {
  render(<LoginPage />);

  expect(screen.getByLabelText(/email|邮箱/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password|密码/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/tenant|租户/i)).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/optional|选填/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the login UI test and verify RED**

Run:

```bash
npx vitest run src/auth/AuthPages.test.tsx
```

Expected: FAIL because `LoginPage` still renders the tenant ID field.

- [ ] **Step 3: Remove tenant ID state and field from login**

In `src/auth/LoginPage.tsx`, remove `tenantId` state, remove the `AuthField` whose label is tenant ID, and call login with only:

```ts
await login({
  email,
  password,
});
```

- [ ] **Step 4: Run login UI test and verify GREEN**

Run:

```bash
npx vitest run src/auth/AuthPages.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Write failing account page test**

Update `src/account/AccountPage.test.tsx` with:

```tsx
it("shows creator account details without internal tenant diagnostics", () => {
  mockUseAuth.mockReturnValue({
    authenticated: true,
    error: null,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    permissions: ["project:read"],
    refreshMe: vi.fn(),
    register: vi.fn(),
    roles: ["tenant_owner"],
    sessionId: "session-1",
    tenant: {
      id: "tenant-1",
      name: "Lee's Workspace",
      plan: "free",
      slug: "lee-workspace",
      status: "active",
    },
    user: {
      displayName: "Lee",
      email: "lee@example.com",
      id: "user-1",
      status: "active",
    },
  });

  render(<AccountPage />);

  expect(screen.getByText("lee@example.com")).toBeInTheDocument();
  expect(screen.getByText(/membership|会员|standard|普通/i)).toBeInTheDocument();
  expect(screen.queryByText("tenant-1")).not.toBeInTheDocument();
  expect(screen.queryByText("user-1")).not.toBeInTheDocument();
  expect(screen.queryByText("tenant_owner")).not.toBeInTheDocument();
  expect(screen.queryByText("project:read")).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Run account test and verify RED**

Run:

```bash
npx vitest run src/account/AccountPage.test.tsx
```

Expected: FAIL because account page currently renders internal IDs, roles, and permissions.

- [ ] **Step 7: Rebuild account page surface**

In `src/account/AccountPage.tsx`, replace the diagnostic `InfoCard` grid with creator-facing fields:

```tsx
const membershipTier = tenant?.plan === "free" ? "standard" : "standard";
const discountLabel = "No discount";
```

Render labels for account, membership, credits entry, and admin-only model/admin links. Do not render `user.id`, `tenant.id`, `tenant.slug`, `roles`, or raw `permissions`.

- [ ] **Step 8: Run account tests and verify GREEN**

Run:

```bash
npx vitest run src/account/AccountPage.test.tsx
```

Expected: PASS.

## Task 2: Add Billing Schema for Membership and Credit Grants

**Files:**
- Create: `packages/db/migrations/000029_single_creator_billing.sql`
- Modify: `packages/db/test/billing.test.ts`

- [ ] **Step 1: Write failing migration/schema test**

Add a migration assertion to `packages/db/test/billing.test.ts`:

```ts
test("single creator billing schema includes membership fields and credit grants", async () => {
  await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
    process.env.DATABASE_URL = databaseUrl;
    const adminPool = createPgPool();
    let appPool = createPgPool();
    try {
      await runMigrations(adminPool);
      appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });

      const accountColumns = await adminPool.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'billing_accounts'
          AND column_name IN (
            'membership_tier',
            'membership_tier_source',
            'membership_tier_expires_at'
          )
      `);
      expect(accountColumns.rows.map((row) => row.column_name).sort()).toEqual([
        "membership_tier",
        "membership_tier_expires_at",
        "membership_tier_source",
      ]);

      const grants = await adminPool.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name IN ('billing_credit_grants', 'billing_credit_reservations')
      `);
      expect(grants.rows.map((row) => row.table_name).sort()).toEqual([
        "billing_credit_grants",
        "billing_credit_reservations",
      ]);
    } finally {
      await appPool.end();
      await adminPool.end();
    }
  });
});
```

- [ ] **Step 2: Run schema test and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/db -- billing.test.ts
```

Expected: FAIL because migration `000029_single_creator_billing.sql` does not exist.

- [ ] **Step 3: Add migration**

Create `packages/db/migrations/000029_single_creator_billing.sql`:

```sql
ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS membership_tier text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS membership_tier_source text NOT NULL DEFAULT 'migration',
  ADD COLUMN IF NOT EXISTS membership_tier_overridden_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS membership_tier_overridden_at timestamptz,
  ADD COLUMN IF NOT EXISTS membership_tier_expires_at timestamptz;

ALTER TABLE billing_accounts
  ADD CONSTRAINT billing_accounts_membership_tier_check
  CHECK (membership_tier IN ('standard', 'silver', 'gold', 'platinum')) NOT VALID;

ALTER TABLE billing_accounts
  ADD CONSTRAINT billing_accounts_membership_tier_source_check
  CHECK (membership_tier_source IN ('plan', 'admin_override', 'migration', 'manual')) NOT VALID;

CREATE TABLE IF NOT EXISTS billing_credit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
  source_type text NOT NULL,
  source_id text,
  original_credits numeric(18, 4) NOT NULL CHECK (original_credits >= 0),
  remaining_credits numeric(18, 4) NOT NULL CHECK (remaining_credits >= 0),
  reserved_credits numeric(18, 4) NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_type IN ('plan', 'payment', 'redeem', 'admin_grant', 'migration')),
  CHECK (status IN ('active', 'exhausted', 'expired', 'revoked'))
);

CREATE TABLE IF NOT EXISTS billing_credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  billing_ledger_id uuid NOT NULL REFERENCES billing_ledger(id),
  credit_grant_id uuid NOT NULL REFERENCES billing_credit_grants(id),
  usage_event_id uuid REFERENCES usage_events(id) ON DELETE SET NULL,
  amount_credits numeric(18, 4) NOT NULL CHECK (amount_credits > 0),
  status text NOT NULL DEFAULT 'reserved',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('reserved', 'settled', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_billing_credit_grants_tenant_active_expiry
  ON billing_credit_grants (tenant_id, status, expires_at ASC NULLS LAST, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_billing_credit_reservations_tenant_ledger
  ON billing_credit_reservations (tenant_id, billing_ledger_id);

INSERT INTO billing_credit_grants (
  tenant_id,
  billing_account_id,
  source_type,
  source_id,
  original_credits,
  remaining_credits,
  reserved_credits,
  expires_at,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT
  account.tenant_id,
  account.id,
  'migration',
  account.id::text,
  account.balance_cents,
  account.balance_cents,
  account.reserved_cents,
  NULL,
  CASE WHEN account.balance_cents <= 0 THEN 'exhausted' ELSE 'active' END,
  jsonb_build_object('source', 'pre-expiry billing_accounts balance'),
  now(),
  now()
FROM billing_accounts AS account
WHERE NOT EXISTS (
  SELECT 1
  FROM billing_credit_grants AS grant
  WHERE grant.billing_account_id = account.id
    AND grant.source_type = 'migration'
);

ALTER TABLE billing_credit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_credit_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_credit_grants_select_current_tenant
  ON billing_credit_grants
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY billing_credit_grants_insert_current_tenant
  ON billing_credit_grants
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY billing_credit_grants_update_current_tenant
  ON billing_credit_grants
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE billing_credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_credit_reservations FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_credit_reservations_select_current_tenant
  ON billing_credit_reservations
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY billing_credit_reservations_insert_current_tenant
  ON billing_credit_reservations
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY billing_credit_reservations_update_current_tenant
  ON billing_credit_reservations
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
```

- [ ] **Step 4: Run schema test and verify GREEN**

Run:

```bash
npm run test --workspace @aigc-flow/db -- billing.test.ts
```

Expected: PASS for the new schema test.

## Task 3: Implement Credit Grants and Membership Discount in BillingService

**Files:**
- Modify: `packages/db/src/billing.ts`
- Modify: `packages/db/test/billing.test.ts`

- [ ] **Step 1: Write failing service tests**

Add tests in `packages/db/test/billing.test.ts` for:

```ts
test("reserveUsage consumes expiring credit grants before lifetime grants", async () => {
  // Seed one tenant, billing account, three grants:
  // 100 lifetime, 20 expires tomorrow, 30 expires next month.
  // Reserve 25.
  // Expect 20 reserved from tomorrow grant and 5 from next-month grant.
});

test("expired credit grants are excluded from available balance", async () => {
  // Seed 100 expired credits and 15 active credits.
  // Summary availableCredits must be 15.
});

test("membership discounts reduce billable reserve amounts", async () => {
  expect(resolveMembershipDiscount("standard")).toEqual({ tier: "standard", multiplier: 1 });
  expect(resolveMembershipDiscount("silver")).toEqual({ tier: "silver", multiplier: 0.95 });
  expect(resolveMembershipDiscount("gold")).toEqual({ tier: "gold", multiplier: 0.9 });
  expect(resolveMembershipDiscount("platinum")).toEqual({ tier: "platinum", multiplier: 0.8 });
});
```

Use existing database helpers in the file for tenant/user seeding. Assert rows from `billing_credit_reservations`.

- [ ] **Step 2: Run service tests and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/db -- billing.test.ts
```

Expected: FAIL because helper exports and grant allocation logic do not exist.

- [ ] **Step 3: Add billing types and discount helper**

In `packages/db/src/billing.ts`, export:

```ts
export type MembershipTier = "standard" | "silver" | "gold" | "platinum";

export type MembershipDiscount = {
  multiplier: number;
  tier: MembershipTier;
};

export function resolveMembershipDiscount(value: string | null | undefined): MembershipDiscount {
  if (value === "silver") return { multiplier: 0.95, tier: "silver" };
  if (value === "gold") return { multiplier: 0.9, tier: "gold" };
  if (value === "platinum") return { multiplier: 0.8, tier: "platinum" };
  return { multiplier: 1, tier: "standard" };
}

export function applyMembershipDiscount(amountCredits: number, discount: MembershipDiscount): number {
  const discounted = amountCredits * discount.multiplier;
  return Math.round(discounted * 10_000) / 10_000;
}
```

- [ ] **Step 4: Add grant-aware summary queries**

Update `BillingSummaryView` to include:

```ts
creditGrants: {
  availableCredits: number;
  expiringSoonCredits: number;
  lifetimeCredits: number;
  reservedCredits: number;
};
membership: {
  discountMultiplier: number;
  tier: MembershipTier;
};
```

In `getBillingSummary`, compute active grants with:

```sql
SELECT
  COALESCE(SUM(GREATEST(remaining_credits - reserved_credits, 0))
    FILTER (WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now())), 0)::text AS available_credits,
  COALESCE(SUM(reserved_credits)
    FILTER (WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now())), 0)::text AS reserved_credits,
  COALESCE(SUM(GREATEST(remaining_credits - reserved_credits, 0))
    FILTER (WHERE status = 'active' AND expires_at > now() AND expires_at <= now() + interval '30 days'), 0)::text AS expiring_soon_credits,
  COALESCE(SUM(GREATEST(remaining_credits - reserved_credits, 0))
    FILTER (WHERE status = 'active' AND expires_at IS NULL), 0)::text AS lifetime_credits
FROM billing_credit_grants
WHERE tenant_id = $1::uuid
```

- [ ] **Step 5: Replace reserve account mutation with grant allocation**

Inside `reserveUsageWithClient`, after locking the account, select grants:

```sql
SELECT
  id::text AS id,
  remaining_credits::text AS remaining_credits,
  reserved_credits::text AS reserved_credits
FROM billing_credit_grants
WHERE tenant_id = $1::uuid
  AND status = 'active'
  AND (expires_at IS NULL OR expires_at > now())
  AND remaining_credits > reserved_credits
ORDER BY expires_at ASC NULLS LAST, created_at ASC, id ASC
FOR UPDATE
```

Allocate until requested amount is covered. If not covered, throw existing `INSUFFICIENT_BALANCE`.

For each allocation, update:

```sql
UPDATE billing_credit_grants
SET reserved_credits = reserved_credits + $2::numeric,
    updated_at = now()
WHERE id = $1::uuid
```

After the ledger entry is created, insert `billing_credit_reservations` rows with the ledger ID, grant ID, and allocated amount.

- [ ] **Step 6: Update settle/refund**

In `settleUsageWithClient`, after ledger creation, load reservations from the matching reserve ledger ID passed in metadata or from `input.metadata.reserveLedgerId`. For each reserved allocation:

```sql
UPDATE billing_credit_grants
SET remaining_credits = GREATEST(remaining_credits - $2::numeric, 0),
    reserved_credits = GREATEST(reserved_credits - $2::numeric, 0),
    status = CASE
      WHEN GREATEST(remaining_credits - $2::numeric, 0) <= 0 THEN 'exhausted'
      ELSE status
    END,
    updated_at = now()
WHERE id = $1::uuid
```

Mark reservation `settled`.

In `refundUsageWithClient`, mark matching reservations `refunded` and decrement only `reserved_credits`.

- [ ] **Step 7: Run service tests and verify GREEN**

Run:

```bash
npm run test --workspace @aigc-flow/db -- billing.test.ts
```

Expected: PASS.

## Task 4: Expose Billing Summary and Discounts Through API

**Files:**
- Modify: `apps/api/src/modules/billing/billing.service.ts`
- Modify: `src/billing/billingApi.ts`
- Modify: `src/billing/BillingCenterPage.test.tsx`
- Modify: `src/billing/BillingSummaryCards.tsx`

- [ ] **Step 1: Write failing API/UI tests**

Update `src/billing/BillingCenterPage.test.tsx` fixture summary:

```ts
membership: { tier: "gold", discountMultiplier: 0.9 },
creditGrants: {
  availableCredits: 120,
  expiringSoonCredits: 20,
  lifetimeCredits: 100,
  reservedCredits: 5,
},
```

Assert visible text includes `Gold` or `黄金`, `9`, `20`, and `100`.

- [ ] **Step 2: Run billing UI test and verify RED**

Run:

```bash
npx vitest run src/billing/BillingCenterPage.test.tsx
```

Expected: FAIL because the UI does not render membership and grant summaries.

- [ ] **Step 3: Update API types**

In `src/billing/billingApi.ts`, add:

```ts
membership: {
  discountMultiplier: number;
  tier: "standard" | "silver" | "gold" | "platinum";
};
creditGrants: {
  availableCredits: number;
  expiringSoonCredits: number;
  lifetimeCredits: number;
  reservedCredits: number;
};
```

- [ ] **Step 4: Update summary cards**

In `src/billing/BillingSummaryCards.tsx`, render:

- available credits from `summary.creditGrants.availableCredits`
- reserved credits from `summary.creditGrants.reservedCredits`
- expiring soon credits
- lifetime credits
- membership discount multiplier

Fallback to existing account fields if `creditGrants` is absent for compatibility.

- [ ] **Step 5: Run billing UI test and verify GREEN**

Run:

```bash
npx vitest run src/billing/BillingCenterPage.test.tsx
```

Expected: PASS.

## Task 5: Platform Admin User Management, Tier Override, and Expiring Grants

**Files:**
- Modify: `apps/api/src/modules/admin/admin.schemas.ts`
- Modify: `apps/api/src/modules/admin/admin.service.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/api/test/admin.test.ts`
- Modify: `src/admin/adminApi.ts`
- Modify: `src/admin/AdminPage.tsx`

- [ ] **Step 1: Write failing admin API tests**

In `apps/api/test/admin.test.ts`, add:

```ts
test("system admin can search users outside the current tenant", async () => {
  // Register admin in Ops Tenant.
  // Register target user in Creator Tenant.
  // Login admin without adding membership to Creator Tenant.
  // GET /api/v2/admin/users?query=target email.
  // Expect target user appears with Creator Tenant membership.
});

test("system admin can set membership tier and grant expiring credits", async () => {
  // PATCH /api/v2/admin/users/:userId/membership-tier { tier: "gold" }
  // POST /api/v2/admin/users/:userId/grant-credits { credits: 100, validityMode: "months", validityMonths: 3 }
  // Expect billing_accounts.membership_tier = gold.
  // Expect billing_credit_grants.expires_at is approximately now + 3 months.
});
```

- [ ] **Step 2: Run admin tests and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/api -- admin.test.ts
```

Expected: FAIL because user search is tenant-scoped and new endpoints do not exist.

- [ ] **Step 3: Add admin schemas**

Add schemas:

```ts
export const adminUpdateMembershipTierSchema = z.object({
  tier: z.enum(["standard", "silver", "gold", "platinum"]),
  expiresAt: z.string().datetime().optional(),
});

export const adminGrantCreditsSchema = z.object({
  credits: z.number().positive(),
  idempotencyKey: z.string().optional(),
  reason: z.string().min(1),
  tenantId: z.string().uuid().optional(),
  validityMode: z.enum(["months", "days", "lifetime", "custom"]).default("lifetime"),
  validityMonths: z.number().int().positive().optional(),
  validityDays: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
});
```

- [ ] **Step 4: Make searchUsers platform-scoped**

In `AdminApiService.searchUsers`, replace the tenant-scoped `FROM tenant_memberships WHERE tenant_id = $1` query with a platform query against `users`, then load all memberships for returned users.

Keep mutations such as credit grant scoped to the target tenant, not the admin's current tenant.

- [ ] **Step 5: Add tier update service and route**

Add `updateMembershipTier(context, input)`:

```sql
UPDATE billing_accounts
SET membership_tier = $2,
    membership_tier_source = 'admin_override',
    membership_tier_overridden_by = $3::uuid,
    membership_tier_overridden_at = now(),
    membership_tier_expires_at = $4::timestamptz,
    updated_at = now()
WHERE tenant_id = $1::uuid
RETURNING tenant_id::text AS tenant_id, membership_tier
```

Route:

```txt
PATCH /api/v2/admin/users/:userId/membership-tier
```

Use the selected or first active user membership as target tenant.

- [ ] **Step 6: Update grant credits to create credit grant**

After crediting account via existing ledger path, insert a `billing_credit_grants` row with selected expiration. Validity conversion:

```ts
if (validityMode === "months") expiresAt = now + validityMonths months;
if (validityMode === "days") expiresAt = now + validityDays days;
if (validityMode === "custom") expiresAt = input.expiresAt;
if (validityMode === "lifetime") expiresAt = null;
```

- [ ] **Step 7: Run admin tests and verify GREEN**

Run:

```bash
npm run test --workspace @aigc-flow/api -- admin.test.ts
```

Expected: PASS.

## Task 6: Apply Discounts and Grant Allocation to Workbench and Workflow Runs

**Files:**
- Modify: `apps/api/src/modules/workbench/workbench.service.ts`
- Modify: `apps/api/test/workbench-service.test.ts`
- Modify: `apps/api/src/modules/workflow-runs/workflow-runs.service.ts`
- Modify: workflow run API tests in `apps/api/test`

- [ ] **Step 1: Write failing workbench discount test**

In `apps/api/test/workbench-service.test.ts`, add a test that seeds `billing_accounts.membership_tier = 'gold'`, route price `10`, creates a workbench generation, and expects:

```ts
expect(generation.estimatedCredits).toBe(9);
expect(generation.reservedCredits).toBe(9);
```

Also assert reserve ledger metadata includes:

```ts
expect(metadata.originalCredits).toBe(10);
expect(metadata.discountedCredits).toBe(9);
expect(metadata.membershipTier).toBe("gold");
expect(metadata.discountMultiplier).toBe(0.9);
```

- [ ] **Step 2: Run workbench test and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/api -- workbench-service.test.ts
```

Expected: FAIL because no discount is applied.

- [ ] **Step 3: Implement workbench discount**

In `WorkbenchService.createGeneration`, load billing account membership tier before reserve:

```sql
SELECT membership_tier
FROM billing_accounts
WHERE tenant_id = $1::uuid
LIMIT 1
```

Use `resolveMembershipDiscount` and `applyMembershipDiscount` from `@aigc-flow/db`.

Set `estimatedCredits` to discounted credits. Include original and discounted metadata in reserve call.

- [ ] **Step 4: Run workbench test and verify GREEN**

Run:

```bash
npm run test --workspace @aigc-flow/api -- workbench-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing workflow discount test**

In the workflow-runs API test file, seed a gold membership, create a priced node with original price `10`, run target-node creation, and assert node `cost_json` has:

```ts
estimatedCredits: 9,
originalCredits: 10,
membershipTier: "gold",
discountMultiplier: 0.9,
reserveStatus: "reserved",
```

- [ ] **Step 6: Run workflow test and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/api -- workflow-runs
```

Expected: FAIL because workflow pricing uses original amount.

- [ ] **Step 7: Implement workflow discount**

In `WorkflowRunsService`, after `estimateNodeReserveCents`, apply membership discount once per run:

```ts
const membership = await this.loadMembershipDiscount(client, context.tenantId);
const originalCredits = estimatedCost.amountCents;
const discountedCredits = applyMembershipDiscount(originalCredits, membership);
```

Reserve `discountedCredits`; store both values in `cost_json` and reserve metadata.

- [ ] **Step 8: Run workflow test and verify GREEN**

Run:

```bash
npm run test --workspace @aigc-flow/api -- workflow-runs
```

Expected: PASS.

## Task 7: Frontend Admin Controls

**Files:**
- Modify: `src/admin/adminApi.ts`
- Modify: `src/admin/AdminPage.tsx`
- Create or modify: `src/admin/AdminPage.test.tsx`

- [ ] **Step 1: Write failing admin page test**

Create `src/admin/AdminPage.test.tsx` if absent. Mock `searchAdminUsers`, `updateAdminMembershipTier`, and `grantAdminCredits`.

Assert:

```tsx
expect(screen.getByText(/membership|会员/i)).toBeInTheDocument();
expect(screen.getByRole("button", { name: /gold|黄金/i })).toBeInTheDocument();
expect(screen.getByText(/1 month|1个月/i)).toBeInTheDocument();
expect(screen.getByText(/3 months|3个月/i)).toBeInTheDocument();
expect(screen.getByText(/1 year|1年/i)).toBeInTheDocument();
expect(screen.getByText(/lifetime|长期/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run admin page test and verify RED**

Run:

```bash
npx vitest run src/admin/AdminPage.test.tsx
```

Expected: FAIL because the controls do not exist.

- [ ] **Step 3: Update admin API client**

Add:

```ts
export function updateAdminMembershipTier(input: {
  expiresAt?: string;
  targetUserId: string;
  tenantId?: string;
  tier: "standard" | "silver" | "gold" | "platinum";
}) {
  return apiPatch(`/admin/users/${input.targetUserId}/membership-tier`, input);
}
```

Extend `grantAdminCredits` input with `validityMode`, `validityMonths`, `validityDays`, and `expiresAt`.

- [ ] **Step 4: Update admin page**

Add a membership card on selected user detail:

- segmented tier buttons
- save button
- credit grant validity control with 1 month, 3 months, 1 year, lifetime, custom

Use existing compact input/button style. Do not use native select if a shared menu select is already available.

- [ ] **Step 5: Run admin page test and verify GREEN**

Run:

```bash
npx vitest run src/admin/AdminPage.test.tsx
```

Expected: PASS.

## Task 8: Verification, Docs, and Project Record

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx vitest run src/auth/AuthPages.test.tsx src/account/AccountPage.test.tsx src/billing/BillingCenterPage.test.tsx src/admin/AdminPage.test.tsx
npm run test --workspace @aigc-flow/db -- billing.test.ts
npm run test --workspace @aigc-flow/api -- admin.test.ts workbench-service.test.ts
```

Expected: PASS. If database infrastructure is unavailable, record the exact missing dependency and which non-DB tests passed.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Update project record**

Add a dated entry to `PROJECT_RECORD.md`:

```md
## 2026-06-18 - Single-Creator Account and Expiring Credits Design/Implementation

- Removed tenant ID from the normal creator login path.
- Reworked account management toward a creator-facing account center.
- Added membership-tier billing semantics for standard, silver, gold, and platinum users.
- Added expiring credit batch data model and grant allocation rules.
- Updated admin direction toward platform-level user management and expiring credit grants.
- Validation:
  - [list commands run and outcomes]
```

- [ ] **Step 4: Check git status**

Run:

```bash
git status --short
```

Expected: only files touched for this task plus pre-existing unrelated files. Do not stage unrelated changes.

