# Wallet Completion Runtime Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore image-generation completion by fixing wallet settlement SQL and expiry ACLs, then make provider polling recover from statement errors without leaving runs stuck.

**Architecture:** Add one forward-only database migration that preserves the wallet contract while qualifying every collision-prone settlement column and granting only function execution to the configured runtime role. Add a small tested savepoint helper around the asynchronous provider-poll persistence block so failure/refund writes run after transaction recovery and BullMQ receives the original database error. Keep synchronous completion unchanged because it already uses a separate error-finalization transaction.

**Tech Stack:** PostgreSQL PL/pgSQL and RLS, Node.js 22, TypeScript, `pg`, BullMQ, Vitest, Docker Compose v2.

---

## File Structure

**Create**

- `packages/db/migrations/000058_wallet_completion_runtime_recovery.sql`: replace the settlement function and restore runtime expiry execution.
- `apps/worker/src/workflow-runtime/recoverable-savepoint.ts`: isolate safe savepoint creation, rollback, and release.
- `apps/worker/test/recoverable-savepoint.test.ts`: prove recovery can write after a simulated PostgreSQL-aborted statement.

**Modify**

- `packages/db/test/personal-wallet-migration-sql.test.ts`: lock the qualified SQL and least-privilege ACL contract.
- `apps/worker/src/workflow-runtime/service.ts`: run the `provider.poll` persistence/settlement block through the savepoint helper.
- `apps/worker/src/logger.ts`: extract safe PostgreSQL diagnostic fields.
- `apps/worker/src/queues/registry.ts`: include safe original database fields in failed-job logs.
- `apps/worker/test/worker.test.ts`: verify database error-field normalization.
- `PROJECT_RECORD.md`: record diagnosis, implementation, validation, and required staging recovery.

## Task 1: Add The Wallet Completion Migration

**Files:**

- Create: `packages/db/migrations/000058_wallet_completion_runtime_recovery.sql`
- Modify: `packages/db/test/personal-wallet-migration-sql.test.ts`

- [ ] **Step 1: Write the failing migration contract test**

Append this test inside the existing migration describe block:

```ts
test("qualifies wallet completion columns and restores runtime expiry execution", async () => {
  const migrationPath = path.resolve(
    import.meta.dirname,
    "../migrations/000058_wallet_completion_runtime_recovery.sql",
  );
  let migrationExists = true;
  try {
    await access(migrationPath);
  } catch {
    migrationExists = false;
  }

  expect(migrationExists).toBe(true);
  if (!migrationExists) return;

  const sql = await readFile(migrationPath, "utf8");
  expect(sql).toContain("CREATE OR REPLACE FUNCTION app.wallet_settle_or_refund");
  expect(sql).toContain("FROM billing_wallets AS wallet");
  expect(sql).toContain("WHERE wallet.user_id = p_user_id");
  expect(sql).toContain("FROM billing_wallet_ledger AS ledger");
  expect(sql).toContain("WHERE ledger.user_id = p_user_id");
  expect(sql).toContain("FROM billing_wallet_ledger AS reserve_ledger");
  expect(sql).toContain("WHERE reserve_ledger.id = p_reserve_ledger_id");
  expect(sql).toContain("FROM billing_wallet_credit_reservations AS reservation");
  expect(sql).toContain("WHERE reservation.user_id = p_user_id");
  expect(sql).toContain("FROM billing_wallet_credit_grants AS credit_grant");
  expect(sql).toContain("WHERE credit_grant.id = v_reservation.credit_grant_id");
  expect(sql).toContain("UPDATE billing_wallet_credit_grants AS credit_grant");
  expect(sql).toContain("UPDATE billing_wallet_credit_reservations AS reservation");
  expect(sql).toContain("UPDATE billing_wallets AS wallet");
  expect(sql).toContain("current_setting('app.api_database_role', true)");
  expect(sql).toContain(
    "app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb)",
  );
  expect(sql).toContain("app.wallet_expire_due(integer, timestamptz)");
  expect(sql).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[^;]+TO\s+runtime_role/i);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/db -- personal-wallet-migration-sql.test.ts
```

Expected: FAIL because `000058_wallet_completion_runtime_recovery.sql` does not exist.

- [ ] **Step 3: Create the forward migration**

Create `000058_wallet_completion_runtime_recovery.sql` with the existing managed-role switch used by migrations `000045`, `000046`, and `000055`:

```sql
GRANT USAGE, CREATE ON SCHEMA app TO tapflow_wallet_callback;
GRANT tapflow_wallet_callback TO CURRENT_USER WITH INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
SET LOCAL ROLE tapflow_wallet_callback;

CREATE OR REPLACE FUNCTION app.wallet_settle_or_refund(
  p_operation text,
  p_user_id uuid,
  p_tenant_id uuid,
  p_reserve_ledger_id uuid,
  p_usage_event_id uuid,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid,
  wallet_id uuid,
  user_id uuid,
  tenant_id uuid,
  usage_event_id uuid,
  entry_type text,
  amount_credits numeric,
  idempotency_key text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_wallet billing_wallets%ROWTYPE;
  v_reserve billing_wallet_ledger%ROWTYPE;
  v_ledger billing_wallet_ledger%ROWTYPE;
  v_reservation billing_wallet_credit_reservations%ROWTYPE;
  v_grant billing_wallet_credit_grants%ROWTYPE;
  v_total numeric := 0;
  v_expired_refund numeric := 0;
BEGIN
  IF p_operation NOT IN ('settle', 'refund') OR p_idempotency_key = ''
    OR (p_operation = 'settle' AND p_usage_event_id IS NULL) THEN
    RAISE EXCEPTION 'invalid wallet completion';
  END IF;

  SELECT wallet.* INTO v_wallet
  FROM billing_wallets AS wallet
  WHERE wallet.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;

  SELECT ledger.* INTO v_ledger
  FROM billing_wallet_ledger AS ledger
  WHERE ledger.user_id = p_user_id
    AND ledger.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_ledger.entry_type <> p_operation
      OR v_ledger.tenant_id IS DISTINCT FROM p_tenant_id
      OR (p_operation = 'settle' AND v_ledger.usage_event_id IS DISTINCT FROM p_usage_event_id) THEN
      RAISE EXCEPTION 'WALLET_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id,
      v_ledger.tenant_id, v_ledger.usage_event_id, v_ledger.entry_type,
      v_ledger.amount_credits, v_ledger.idempotency_key, v_ledger.created_at;
    RETURN;
  END IF;

  SELECT reserve_ledger.* INTO v_reserve
  FROM billing_wallet_ledger AS reserve_ledger
  WHERE reserve_ledger.id = p_reserve_ledger_id
    AND reserve_ledger.user_id = p_user_id
    AND reserve_ledger.entry_type = 'reserve'
  FOR UPDATE;
  IF NOT FOUND OR v_reserve.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  FOR v_reservation IN
    SELECT reservation.*
    FROM billing_wallet_credit_reservations AS reservation
    WHERE reservation.user_id = p_user_id
      AND reservation.wallet_ledger_id = p_reserve_ledger_id
      AND reservation.status = 'reserved'
    FOR UPDATE
  LOOP
    SELECT credit_grant.* INTO v_grant
    FROM billing_wallet_credit_grants AS credit_grant
    WHERE credit_grant.id = v_reservation.credit_grant_id
    FOR UPDATE;
    v_total := v_total + v_reservation.amount_credits;

    IF p_operation = 'settle' THEN
      UPDATE billing_wallet_credit_grants AS credit_grant
      SET remaining_credits = credit_grant.remaining_credits - v_reservation.amount_credits,
          reserved_credits = credit_grant.reserved_credits - v_reservation.amount_credits,
          status = CASE
            WHEN credit_grant.remaining_credits - v_reservation.amount_credits = 0
              THEN 'exhausted'
            ELSE credit_grant.status
          END,
          updated_at = now()
      WHERE credit_grant.id = v_grant.id;
      UPDATE billing_wallet_credit_reservations AS reservation
      SET status = 'settled', usage_event_id = p_usage_event_id, updated_at = now()
      WHERE reservation.id = v_reservation.id;
    ELSE
      IF v_grant.status = 'expired' THEN
        v_expired_refund := v_expired_refund + v_reservation.amount_credits;
      END IF;
      UPDATE billing_wallet_credit_grants AS credit_grant
      SET reserved_credits = credit_grant.reserved_credits - v_reservation.amount_credits,
          remaining_credits = CASE
            WHEN credit_grant.status = 'expired'
              THEN credit_grant.reserved_credits - v_reservation.amount_credits
            ELSE credit_grant.remaining_credits
          END,
          updated_at = now()
      WHERE credit_grant.id = v_grant.id;
      UPDATE billing_wallet_credit_reservations AS reservation
      SET status = 'refunded', updated_at = now()
      WHERE reservation.id = v_reservation.id;
    END IF;
  END LOOP;

  IF v_total <= 0 THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;

  INSERT INTO billing_wallet_ledger (
    wallet_id, user_id, tenant_id, usage_event_id, entry_type,
    amount_credits, idempotency_key, metadata
  ) VALUES (
    v_wallet.id, p_user_id, p_tenant_id,
    CASE WHEN p_operation = 'settle' THEN p_usage_event_id ELSE NULL END,
    p_operation,
    CASE WHEN p_operation = 'settle' THEN -v_total ELSE v_total END,
    p_idempotency_key,
    COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING billing_wallet_ledger.* INTO v_ledger;

  UPDATE billing_wallets AS wallet
  SET balance_credits = CASE
        WHEN p_operation = 'settle' THEN wallet.balance_credits - v_total
        WHEN p_operation = 'refund' THEN GREATEST(wallet.balance_credits - v_expired_refund, 0)
        ELSE wallet.balance_credits
      END,
      reserved_credits = wallet.reserved_credits - v_total,
      updated_at = now()
  WHERE wallet.id = v_wallet.id;

  RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id,
    v_ledger.tenant_id, v_ledger.usage_event_id, v_ledger.entry_type,
    v_ledger.amount_credits, v_ledger.idempotency_key, v_ledger.created_at;
END;
$$;

REVOKE ALL ON FUNCTION app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC;

DO $$
DECLARE
  runtime_role name := COALESCE(
    NULLIF(current_setting('app.api_database_role', true), ''),
    session_user
  );
BEGIN
  IF runtime_role = 'tapflow_wallet_callback' THEN
    RAISE EXCEPTION 'API_DATABASE_ROLE must be the runtime API role, not the callback owner';
  END IF;
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb) TO %I',
    runtime_role
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION app.wallet_expire_due(integer, timestamptz) TO %I',
    runtime_role
  );
END;
$$;

RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;
REVOKE tapflow_wallet_callback FROM CURRENT_USER GRANTED BY CURRENT_USER;
```

- [ ] **Step 4: Run DB tests and verify GREEN**

Run:

```bash
npm run test --workspace @aigc-flow/db -- personal-wallet-migration-sql.test.ts personal-wallet.test.ts
```

Expected: all non-infrastructure tests pass; database-backed tests may be skipped when `DATABASE_URL` is absent.

- [ ] **Step 5: Commit the database repair**

```bash
git add packages/db/migrations/000058_wallet_completion_runtime_recovery.sql packages/db/test/personal-wallet-migration-sql.test.ts
git commit -m "fix(billing): repair wallet completion runtime"
```

## Task 2: Recover Provider Poll Transactions

**Files:**

- Create: `apps/worker/src/workflow-runtime/recoverable-savepoint.ts`
- Create: `apps/worker/test/recoverable-savepoint.test.ts`
- Modify: `apps/worker/src/workflow-runtime/service.ts`

- [ ] **Step 1: Write failing savepoint tests**

Create a test with a fake client that enters an aborted state when a statement throws. Assert that rollback occurs before the failure-state write:

```ts
import { describe, expect, test } from "vitest";

import {
  createRecoverableSavepoint,
  rollbackToRecoverableSavepoint,
} from "../src/workflow-runtime/recoverable-savepoint.js";

describe("recoverable provider-poll savepoints", () => {
  test("rolls back an aborted statement before running recovery", async () => {
    const original = Object.assign(new Error("column reference user_id is ambiguous"), {
      code: "42702",
    });
    const queries: string[] = [];
    let aborted = false;
    const client = {
      async query(sql: string) {
        queries.push(sql);
        if (sql === "SELECT broken") {
          aborted = true;
          throw original;
        }
        if (sql.startsWith("ROLLBACK TO SAVEPOINT")) {
          aborted = false;
          return { rows: [] };
        }
        if (aborted) {
          throw Object.assign(new Error("current transaction is aborted"), { code: "25P02" });
        }
        return { rows: [] };
      },
    };
    await createRecoverableSavepoint(client as never, "provider_poll_attempt");
    await expect(client.query("SELECT broken")).rejects.toBe(original);
    await rollbackToRecoverableSavepoint(client as never, "provider_poll_attempt");
    await client.query("UPDATE workflow_runs SET status = 'failed'");

    expect(queries).toEqual([
      "SAVEPOINT provider_poll_attempt",
      "SELECT broken",
      "ROLLBACK TO SAVEPOINT provider_poll_attempt",
      "RELEASE SAVEPOINT provider_poll_attempt",
      "UPDATE workflow_runs SET status = 'failed'",
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- recoverable-savepoint.test.ts
```

Expected: FAIL because `recoverable-savepoint.ts` does not exist.

- [ ] **Step 3: Implement the minimal savepoint helper**

Create `recoverable-savepoint.ts`:

```ts
import type { PoolClient } from "pg";

const SAFE_SAVEPOINT_NAME = /^[a-z][a-z0-9_]*$/;

function assertSavepointName(savepointName: string): void {
  if (!SAFE_SAVEPOINT_NAME.test(savepointName)) {
    throw new Error(`Invalid savepoint name: ${savepointName}`);
  }
}

export async function createRecoverableSavepoint(
  client: Pick<PoolClient, "query">,
  savepointName: string,
): Promise<void> {
  assertSavepointName(savepointName);
  await client.query(`SAVEPOINT ${savepointName}`);
}

export async function rollbackToRecoverableSavepoint(
  client: Pick<PoolClient, "query">,
  savepointName: string,
): Promise<void> {
  assertSavepointName(savepointName);
  await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
  await client.query(`RELEASE SAVEPOINT ${savepointName}`);
}
```

- [ ] **Step 4: Wrap only the asynchronous polling persistence block**

Import both helper functions from `./recoverable-savepoint.js`. In
`pollProviderTaskInTransaction`, create the savepoint immediately before the
existing inner `try`, then restore the transaction as the first action in its
existing `catch`:

```ts
await createRecoverableSavepoint(client, "provider_poll_attempt");
try {
```

Keep the current `try` body byte-for-byte. At the current catch boundary use:

```ts
} catch (error) {
  await rollbackToRecoverableSavepoint(client, "provider_poll_attempt");
  const normalized = normalizeError(error);
  await this.failNodeAndWorkflow(client, workflowRun.id, currentNodeRun.id, input.tenantId, normalized);
  return {
    auditLogs: [],
    deferredVariantJobs: [],
    errorToThrow: error instanceof Error ? error : new Error(String(error)),
    nodeEnqueuePayloads: [],
    pollEnqueuePayloads: [],
    processorResult: {
      jobId: null,
      queueName: QUEUE_NAMES.providerPoll,
      status: "ok",
      tenantId: input.tenantId,
      traceId: input.traceId ?? null,
    },
  };
}
```

Do not edit the statements already inside the `try`. A successful outer
transaction commit releases the savepoint automatically. Every caught error
restores and releases it before `failNodeAndWorkflow` runs.

Do not change `executePreparedNode`; its existing
`finalizeNodeExecutionErrorInTransaction` already opens a clean transaction
after the success transaction rolls back.

- [ ] **Step 5: Run focused Worker tests and verify GREEN**

```bash
npm run test --workspace @aigc-flow/worker -- recoverable-savepoint.test.ts worker.test.ts
```

Expected: savepoint tests pass and existing provider-poll behavior remains green (database-backed cases may be skipped without `DATABASE_URL`).

- [ ] **Step 6: Commit transaction recovery**

```bash
git add apps/worker/src/workflow-runtime/recoverable-savepoint.ts apps/worker/src/workflow-runtime/service.ts apps/worker/test/recoverable-savepoint.test.ts
git commit -m "fix(worker): recover aborted provider poll transactions"
```

## Task 3: Preserve Safe PostgreSQL Diagnostics

**Files:**

- Modify: `apps/worker/src/logger.ts`
- Modify: `apps/worker/src/queues/registry.ts`
- Modify: `apps/worker/test/worker.test.ts`

- [ ] **Step 1: Write a failing error-field test**

Import `getWorkerErrorFields` and add:

```ts
test("normalizes safe PostgreSQL fields for worker failure logs", () => {
  const error = Object.assign(new Error("column reference user_id is ambiguous"), {
    code: "42702",
    constraint: "wallet_constraint",
    detail: "qualified diagnostic",
    table: "billing_wallet_ledger",
  });
  expect(getWorkerErrorFields(error)).toEqual({
    constraint: "wallet_constraint",
    detail: "qualified diagnostic",
    err: "column reference user_id is ambiguous",
    errorCode: "42702",
    table: "billing_wallet_ledger",
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "normalizes safe PostgreSQL fields"
```

Expected: FAIL because `getWorkerErrorFields` is not exported.

- [ ] **Step 3: Implement safe error normalization**

Add to `logger.ts`:

```ts
export function getWorkerErrorFields(error: unknown): WorkerLogFields {
  const record = error && typeof error === "object"
    ? error as Record<string, unknown>
    : {};
  const optionalString = (key: string) =>
    typeof record[key] === "string" && record[key] ? record[key] : undefined;
  return {
    err: error instanceof Error ? error.message : String(error),
    ...(optionalString("code") ? { errorCode: optionalString("code") } : {}),
    ...(optionalString("constraint") ? { constraint: optionalString("constraint") } : {}),
    ...(optionalString("detail") ? { detail: optionalString("detail") } : {}),
    ...(optionalString("table") ? { table: optionalString("table") } : {}),
  };
}
```

In `queues/registry.ts`, replace the inline `err` field with:

```ts
{
  ...getWorkerErrorFields(error),
  jobId: typedJob.id ?? null,
  queueName,
  tenantId: typedJob.data?.tenantId ?? null,
  traceId: typedJob.data?.traceId ?? null,
}
```

- [ ] **Step 4: Run Worker tests and build**

```bash
npm run test --workspace @aigc-flow/worker
npm run build --workspace @aigc-flow/redis
npm run build --workspace @aigc-flow/worker
```

Expected: all Worker tests pass and the Worker TypeScript build succeeds after the Redis workspace is built.

- [ ] **Step 5: Commit diagnostics**

```bash
git add apps/worker/src/logger.ts apps/worker/src/queues/registry.ts apps/worker/test/worker.test.ts
git commit -m "fix(worker): retain database failure diagnostics"
```

## Task 4: Record And Verify The Repair

**Files:**

- Modify: `PROJECT_RECORD.md`
- Modify: `docs/superpowers/specs/2026-08-01-wallet-completion-runtime-recovery-design.md`
- Create: `docs/superpowers/plans/2026-08-01-wallet-completion-runtime-recovery.md`

- [ ] **Step 1: Update the project record**

Append a dated entry documenting the staging evidence, `42702` settlement collision, `25P02` masking behavior, missing expiry ACL, migration number, savepoint recovery, tests, and the still-required staging migration/reconciliation.

- [ ] **Step 2: Run full required validation**

```bash
npm run test --workspace @aigc-flow/db -- personal-wallet-migration-sql.test.ts personal-wallet.test.ts
npm run test --workspace @aigc-flow/worker
npm run build --workspace @aigc-flow/db
npm run build --workspace @aigc-flow/redis
npm run build --workspace @aigc-flow/worker
npm run build
```

Expected: all non-infrastructure tests and builds pass. Report exact skipped database integration tests when no local PostgreSQL is configured.

- [ ] **Step 3: Inspect only task files**

```bash
git status --short
git diff --check
git diff -- packages/db/migrations/000058_wallet_completion_runtime_recovery.sql packages/db/test/personal-wallet-migration-sql.test.ts apps/worker/src/workflow-runtime/recoverable-savepoint.ts apps/worker/src/workflow-runtime/service.ts apps/worker/src/logger.ts apps/worker/src/queues/registry.ts apps/worker/test/recoverable-savepoint.test.ts apps/worker/test/worker.test.ts PROJECT_RECORD.md docs/superpowers/specs/2026-08-01-wallet-completion-runtime-recovery-design.md docs/superpowers/plans/2026-08-01-wallet-completion-runtime-recovery.md
```

- [ ] **Step 4: Commit documentation and push `main`**

```bash
git add PROJECT_RECORD.md docs/superpowers/specs/2026-08-01-wallet-completion-runtime-recovery-design.md docs/superpowers/plans/2026-08-01-wallet-completion-runtime-recovery.md
git commit -m "docs: record wallet completion recovery"
git push origin main
```

## Task 5: Deploy And Reconcile The Existing Run

- [ ] **Step 1: Pull, build, stop Worker, migrate, and restart**

Use `/opt/aittco/tapflow`, `/opt/aittco/env/tapflow.staging.env`, and `docker-compose.staging.yml`. Build all services, stop `tapflow-worker`, run `node packages/db/dist/cli.js` once in `tapflow-api`, then start Redis/API/Worker/frontend.

- [ ] **Step 2: Verify migration and runtime readiness**

Confirm the new migration appears in `schema_migrations`, Worker logs contain `v2 worker runtime ready`, the queue list includes `provider.poll`, and the five-minute wallet expiry job no longer logs `permission denied for function wallet_expire_due`.

- [ ] **Step 3: Inspect the exact stuck run before mutation**

Read workflow run `51f9a568-9506-4d28-b7a5-ab7da089a19e`, node run `f55d29c0-a017-4c47-8935-142445cc1494`, its persisted tenant ID, status, reservation status, and provider task ID. Do not enqueue if the workflow or node has become terminal.

- [ ] **Step 4: Re-enqueue exactly one provider poll when still waiting**

Use BullMQ inside `tapflow-worker` with the container's own `REDIS_URL` and `QUEUE_PREFIX`. Add a `provider.poll` payload containing only the persisted tenant ID, node-run ID, workflow-run ID, provider task ID, and a recovery trace ID. Do not call the run-creation API and do not reserve credits again.

- [ ] **Step 5: Verify terminal state and billing**

Confirm one of two valid outcomes: provider success produces an asset, settles the reservation, patches the draft, and marks the run succeeded; provider failure marks the run failed and refunds the reservation. Verify the canvas leaves the generating state and inspect Worker/API logs for the exact run ID.
