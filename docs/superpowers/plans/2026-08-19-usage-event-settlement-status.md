# Usage Event Settlement Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark completed generation usage events as `settled` at runtime and safely backfill historical `pending` events that already have a matching personal-wallet settlement.

**Architecture:** Add one database-service method that updates a usage event only when tenant and billed-user ownership match, then call it after the existing wallet settlement in both Worker success paths. Add migration `000075_usage_event_settlement_status_backfill.sql` with a narrowly guarded, idempotent update based on a same-user `billing_wallet_ledger` settle row. Keep the frontend unchanged because it already maps `settled` to `已结算`.

**Tech Stack:** TypeScript, PostgreSQL, node-postgres, Vitest, existing migration runner, Vite/React billing UI.

---

### Task 1: Add regression tests for runtime status synchronization

**Files:**
- Modify: `packages/db/test/billing.test.ts`
- Modify: `apps/worker/test/worker.test.ts`
- Modify: `apps/worker/test/workbench-generation.service.test.ts`

- [ ] **Step 1: Write the failing database-service test**

Add a test that invokes the new settlement-status method with a real transaction test double or the existing database fixture and asserts the generated SQL includes ownership predicates and only transitions an unfinished event to `settled`. The test must include an already-settled event and assert it is left unchanged.

- [ ] **Step 2: Run the focused test and verify RED**

Run `npm run test --workspace @aigc-flow/db -- billing.test.ts`. Expected result: FAIL because the status-sync method does not yet exist.

- [ ] **Step 3: Write the failing Worker regression test**

Extend the existing successful Flow Worker billing test in `apps/worker/test/worker.test.ts` so its fake `usage_events` row starts as `pending`, settlement returns a usage-event id, and the test expects an update to `status = 'settled'` before node success metadata is persisted. Add the equivalent assertion to the successful workbench settlement test in `apps/worker/test/workbench-generation.service.test.ts`.

- [ ] **Step 4: Run the focused Worker test and verify RED**

Run `npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "billing"` and `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts -t "settle"`. Expected result: FAIL because the success paths currently settle the wallet without updating `usage_events`.

### Task 2: Implement the shared runtime status update

**Files:**
- Modify: `packages/db/src/billing.ts`
- Modify: `packages/db/src/index.ts` only if the public export is not already covered
- Modify: `apps/worker/src/workflow-runtime/service.ts`
- Modify: `apps/worker/src/workbench/workbench-generation.service.ts`

- [ ] **Step 1: Add the minimal database-service method**

Add `markUsageEventSettledWithClient(client, tenantId, billedUserId, usageEventId)` beside the existing usage-event methods. Execute one parameterized update:

```sql
UPDATE usage_events
SET status = 'settled'
WHERE id = $1::uuid
  AND tenant_id = $2::uuid
  AND billed_user_id = $3::uuid
  AND status IN ('pending', 'reserved')
```

Return the affected-row count. Treat zero rows as idempotent success; do not insert a second event or alter a row belonging to another user/tenant.

- [ ] **Step 2: Call the method in the Flow Worker success transaction**

In `recordUsageForNode`, call the method immediately after `settleUsageWithClient` returns and before updating `node_runs.cost_json`. Pass the `usageEvent.id` returned by the existing idempotent usage insert/load call and the already-resolved billed user id.

- [ ] **Step 3: Call the method in the workbench image success transaction**

In `settleGeneration`, call the same method immediately after the personal-wallet settle returns and before updating `workbench_generations` billing columns.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run `npm run test --workspace @aigc-flow/db -- billing.test.ts`, `npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "billing"`, and `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts -t "settle"`. Expected result: all new and existing focused tests pass.

### Task 3: Add the guarded historical backfill migration

**Files:**
- Create: `packages/db/migrations/000075_usage_event_settlement_status_backfill.sql`
- Create or modify: `packages/db/test/usage-event-settlement-status-migration.test.ts`

- [ ] **Step 1: Write the failing migration test**

Add a test that reads the migration SQL and requires all safety predicates: `usage_events.status = 'pending'`, `billing_wallet_ledger.entry_type = 'settle'`, `billing_wallet_ledger.usage_event_id = usage_events.id`, and `billing_wallet_ledger.user_id = usage_events.billed_user_id`. Require a negative guard for a matching refund and require a row-count notice or equivalent migration verification signal.

- [ ] **Step 2: Run the migration test and verify RED**

Run `npm run test --workspace @aigc-flow/db -- usage-event-settlement-status-migration.test.ts`. Expected result: FAIL because migration `000075` does not exist.

- [ ] **Step 3: Implement the forward-only migration**

Create a `DO $$` block that runs:

```sql
UPDATE usage_events AS usage_event
SET status = 'settled'
WHERE usage_event.status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM billing_wallet_ledger AS settle_ledger
    WHERE settle_ledger.entry_type = 'settle'
      AND settle_ledger.usage_event_id = usage_event.id
      AND settle_ledger.user_id = usage_event.billed_user_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM billing_wallet_ledger AS refund_ledger
    WHERE refund_ledger.entry_type = 'refund'
      AND refund_ledger.usage_event_id = usage_event.id
      AND refund_ledger.user_id = usage_event.billed_user_id
  );
```

Capture `ROW_COUNT` with `GET DIAGNOSTICS` and emit `RAISE NOTICE 'usage event settlement backfill updated % rows', ...`. Do not touch reservation counters, ledger rows, or events lacking a matching personal-wallet settle row.

- [ ] **Step 4: Run the migration test and verify GREEN**

Run the focused migration test again. Expected result: PASS.

### Task 4: Update project record and verify the complete change

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Record the operational change**

Add a concise entry under the current progress section noting runtime usage-event settlement synchronization and migration `000075`, while explicitly recording that the separate `13.6` reservation issue remains out of scope.

- [ ] **Step 2: Run focused tests**

Run:

```powershell
npm run test --workspace @aigc-flow/db -- usage-event-settlement-status-migration.test.ts
npm run test --workspace @aigc-flow/db -- billing.test.ts
npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "billing"
```

- [ ] **Step 3: Run the required build and relevant suites**

Run `npm run build`, then `npm run test --workspace @aigc-flow/db` and `npm run test --workspace @aigc-flow/worker`. If local infrastructure prevents integration tests, preserve the exact failure and report it.

- [ ] **Step 4: Inspect the final diff**

Run `git diff --check` and `git status --short`. Confirm only the migration, runtime/database code, focused tests, and `PROJECT_RECORD.md` are included; do not stage unrelated pre-existing workspace changes.

- [ ] **Step 5: Commit the implementation**

Use a task-specific commit such as:

```bash
git add packages/db/src/billing.ts packages/db/migrations/000075_usage_event_settlement_status_backfill.sql packages/db/test apps/worker/src/workflow-runtime/service.ts apps/worker/src/workbench/workbench-generation.service.ts apps/worker/test/worker.test.ts PROJECT_RECORD.md
git commit -m "fix: mark settled usage events as completed"
```
