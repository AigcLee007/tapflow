# Billing Redeem and Payment Status Sync Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make valid personal-wallet redeem codes credit successfully and make newly created payments transition to paid on the open billing page without a manual refresh.

**Architecture:** Add one forward-only database migration to allow the existing `redeem` ledger entry type. Drive the existing billing-page polling effect from React state that is updated both on initial URL load and immediately after checkout creation. Preserve server ownership checks, idempotency, provider callbacks, bounded polling, and existing billing refresh behavior.

**Tech Stack:** PostgreSQL migrations, TypeScript, React, Vitest, Testing Library, Vite, npm workspaces.

---

## File Map

- Create: `packages/db/migrations/000052_wallet_redeem_ledger_entry_type.sql` - expand the personal-wallet ledger entry-type constraint.
- Modify: `packages/db/test/personal-wallet-migration-sql.test.ts` - assert the migration allows `redeem` and preserves the existing entry types.
- Modify: `src/billing/BillingCenterPage.tsx` - make the payment ID that drives polling reactive.
- Modify: `src/billing/BillingCenterPage.test.tsx` - reproduce checkout creation followed by automatic payment polling.
- Modify: `PROJECT_RECORD.md` - record the production diagnosis and completed fix after validation.

### Task 1: Add the database regression test first

**Files:**
- Modify: `packages/db/test/personal-wallet-migration-sql.test.ts`

- [ ] **Step 1: Inspect the existing migration test helpers and assertion style.**

Run:

```powershell
Get-Content packages/db/test/personal-wallet-migration-sql.test.ts
```

Use the existing migration-file loading and SQL normalization helpers; do not add a database dependency to this focused test.

- [ ] **Step 2: Write the failing assertion for migration 000052.**

Add a test that reads `000052_wallet_redeem_ledger_entry_type.sql` and asserts:

```ts
expect(sql).toContain("billing_wallet_ledger_entry_type_check");
expect(sql).toContain("'redeem'");
expect(sql).toContain("'payment'");
expect(sql).toContain("'payment_refund'");
```

Also assert the migration drops/replaces the named constraint before adding the new check, so the test fails while the file is absent.

- [ ] **Step 3: Run the test to verify the expected failure.**

```powershell
npm run test --workspace @aigc-flow/db -- test/personal-wallet-migration-sql.test.ts
```

Expected: FAIL because `000052_wallet_redeem_ledger_entry_type.sql` does not exist yet, not because of a test syntax or environment error.

### Task 2: Implement and verify the ledger constraint migration

**Files:**
- Create: `packages/db/migrations/000052_wallet_redeem_ledger_entry_type.sql`

- [ ] **Step 1: Add the forward-only migration.**

Use this SQL shape so the constraint remains named and all existing values stay valid:

```sql
ALTER TABLE billing_wallet_ledger
  DROP CONSTRAINT IF EXISTS billing_wallet_ledger_entry_type_check;

ALTER TABLE billing_wallet_ledger
  ADD CONSTRAINT billing_wallet_ledger_entry_type_check
  CHECK (entry_type IN (
    'payment', 'migration_credit', 'admin_credit', 'redeem',
    'reserve', 'settle', 'refund', 'expire', 'payment_refund'
  ));
```

- [ ] **Step 2: Run the migration SQL test and verify it passes.**

```powershell
npm run test --workspace @aigc-flow/db -- test/personal-wallet-migration-sql.test.ts
```

Expected: PASS, including the new constraint assertion. No production database is changed by this focused test.

### Task 3: Add the frontend regression test first

**Files:**
- Modify: `src/billing/BillingCenterPage.test.tsx`

- [ ] **Step 1: Add a checkout-creation test that proves polling starts without reload.**

Use fake timers and the existing mocks. The test must:

1. Render `/billing` without a `paymentId` query parameter.
2. Resolve `createPaymentCheckoutMock` with a `checkout_created` payment whose ID is `payment-created-without-reload`.
3. Resolve `getPaymentMock` with the same payment initially, then with a `paid` payment.
4. Click the first recharge plan.
5. Advance timers by 3 seconds and assert `getPaymentMock` was called with the created ID.
6. Resolve the paid response and assert the paid status is rendered.

The test must not call `window.location.reload()` or render a second page instance.

- [ ] **Step 2: Run only the new test and verify it fails.**

```powershell
npm test -- src/billing/BillingCenterPage.test.tsx -t "starts payment polling after checkout creation without a reload"
```

Expected: FAIL because `onCreated` currently updates only `history.replaceState`, while the polling effect depends on the one-time `paymentId` value.

### Task 4: Implement reactive payment polling

**Files:**
- Modify: `src/billing/BillingCenterPage.tsx:1,21-26,40-59`

- [ ] **Step 1: Add state initialized from the current URL.**

Replace the one-time `paymentId` memo with:

```tsx
const initialPaymentId = new URLSearchParams(window.location.search).get("paymentId");
const [activePaymentId, setActivePaymentId] = useState<string | null>(initialPaymentId);
```

Keep the initial read outside an effect so a provider return URL still polls on first render.

- [ ] **Step 2: Make the effect depend on `activePaymentId`.**

Use `activePaymentId` in the guard, API request, and dependency array. Keep the current immediate request, three-second retry, terminal states, cancellation cleanup, and `refresh()` call after `paid`.

- [ ] **Step 3: Update the state when checkout is created.**

In `onCreated`, keep the existing `setPayment`, URL `replaceState`, and add:

```tsx
setActivePaymentId(next.id);
```

The callback dependency array must include `setActivePaymentId` only if the implementation references it through a non-inline callback; React state setters are stable and may remain omitted under the existing local style.

- [ ] **Step 4: Run the new regression test and verify it passes.**

```powershell
npm test -- src/billing/BillingCenterPage.test.tsx -t "starts payment polling after checkout creation without a reload"
```

Expected: PASS with the created payment ID observed by `getPaymentMock` and the paid status rendered after the next response.

### Task 5: Run focused regression suites

**Files:**
- No additional files.

- [ ] **Step 1: Run all affected frontend billing tests.**

```powershell
npm test -- src/billing/BillingCenterPage.test.tsx src/billing/RedeemCodeBox.test.tsx src/billing/PaymentStatusPanel.test.tsx
```

Expected: all listed test files pass.

- [ ] **Step 2: Run affected database and API tests.**

```powershell
npm run test --workspace @aigc-flow/db -- test/personal-wallet-migration-sql.test.ts test/personal-wallet.test.ts
npm run test --workspace @aigc-flow/api -- test/billing-personal-wallet.service.test.ts test/admin-redeem-scope.test.ts
```

Expected: focused tests pass; database-backed tests may report skipped only when no test database is configured.

- [ ] **Step 3: Run builds.**

```powershell
npm run build --workspace @aigc-flow/db
npm run build --workspace @aigc-flow/api
npm run build
```

Expected: exit code 0. Existing Browserslist, dynamic-import, CSS, and chunk-size warnings are acceptable if no new errors occur.

### Task 6: Record the fix and prepare deployment

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Add a dated project-record entry.**

Record that:

- staging diagnosis found `redeem` missing from the wallet ledger constraint;
- migration `000052_wallet_redeem_ledger_entry_type.sql` was added;
- checkout creation now starts polling without a reload;
- focused tests and builds passed;
- the server must run the compiled migration CLI before API/worker restart.

Preserve all existing user edits in `PROJECT_RECORD.md` and do not stage unrelated files.

- [ ] **Step 2: Verify the final diff and migration marker.**

```powershell
git diff --check
rg -n "<<<<<<<|=======|>>>>>>>" PROJECT_RECORD.md packages/db/migrations/000052_wallet_redeem_ledger_entry_type.sql
git status --short --branch
```

Expected: no conflict markers, no whitespace errors, and only task files staged when committing.

- [ ] **Step 3: Commit the implementation.**

```powershell
git add packages/db/migrations/000052_wallet_redeem_ledger_entry_type.sql packages/db/test/personal-wallet-migration-sql.test.ts src/billing/BillingCenterPage.tsx src/billing/BillingCenterPage.test.tsx PROJECT_RECORD.md
git commit -m "fix(billing): redeem codes and payment status sync"
```

- [ ] **Step 4: Deploy with the v2 Compose order.**

After pushing the implementation branch or merging it to `main`, run on the server:

```bash
cd /opt/aittco/tapflow
git fetch --all --prune
git pull --ff-only origin main
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-worker
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-api node packages/db/dist/cli.js
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml ps
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml logs --tail=100 tapflow-api tapflow-worker
```
