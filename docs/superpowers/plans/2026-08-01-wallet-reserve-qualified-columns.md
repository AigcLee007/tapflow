# Wallet Reserve Qualified Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Make canvas workflow creation reserve personal-wallet credits successfully by replacing the ambiguous app.wallet_reserve function through a forward-only migration.

**Architecture:** Preserve the existing personal-wallet definer-function boundary and callback role. Add one migration that recreates only app.wallet_reserve with explicit table aliases, then verify the behavior through source-level SQL assertions and the existing database-backed wallet integration path.

**Tech Stack:** PostgreSQL PL/pgSQL, SQL migrations, Vitest, @aigc-flow/db, Docker Compose v2.

---

## Files

- Create: packages/db/migrations/000055_wallet_reserve_qualified_columns.sql
- Modify: packages/db/test/personal-wallet-migration-sql.test.ts
- Modify: PROJECT_RECORD.md
- Reference: packages/db/test/personal-wallet.test.ts, packages/db/migrations/000045_personal_wallet_accounting_hardening.sql, packages/db/migrations/000053_wallet_redeem_qualified_columns.sql

### Task 1: Add the failing migration regression test

**Files:**
- Modify: packages/db/test/personal-wallet-migration-sql.test.ts

- [ ] **Step 1: Add a test that fails while migration 000055 is absent.**

Add access to the existing node:fs/promises import and append:

~~~ts
test("qualifies wallet reserve columns that collide with RETURNS TABLE output names", async () => {
  const migrationPath = path.resolve(
    import.meta.dirname,
    "../migrations/000055_wallet_reserve_qualified_columns.sql",
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
  expect(sql).toContain(
    "CREATE OR REPLACE FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb)",
  );
  expect(sql).toContain("FROM billing_wallets AS wallet");
  expect(sql).toContain("WHERE wallet.user_id = p_user_id");
  expect(sql).toContain("FROM billing_wallet_ledger AS ledger");
  expect(sql).toContain("WHERE ledger.user_id = p_user_id");
  expect(sql).toContain("FROM billing_wallet_credit_grants AS credit_grant");
  expect(sql).toContain("WHERE credit_grant.wallet_id = v_wallet.id");
  expect(sql).toContain("UPDATE billing_wallet_credit_grants AS credit_grant");
  expect(sql).toContain("UPDATE billing_wallets AS wallet");
  expect(sql).toContain(
    "GRANT EXECUTE ON FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb) TO SESSION_USER;",
  );
});
~~~

- [ ] **Step 2: Run only the new test and verify the expected RED result.**

Run:

~~~bash
npm test -- packages/db/test/personal-wallet-migration-sql.test.ts -t "qualifies wallet reserve columns"
~~~

Expected result before the migration exists: one assertion failure showing expected false to be true, not a collection error.

### Task 2: Add the forward-only SQL migration

**Files:**
- Create: packages/db/migrations/000055_wallet_reserve_qualified_columns.sql

- [ ] **Step 1: Recreate the wallet reserve function under the existing callback role.**

Use the 000053 callback-role pattern and recreate the same function signature. The body must preserve all existing validation, idempotency, lazy expiry, FEFO allocation, reservation insertion, insufficient-balance handling, and nine-column ledger return behavior. The qualified SQL statements are:

~~~sql
SELECT wallet.* INTO v_wallet
FROM billing_wallets AS wallet
WHERE wallet.user_id = p_user_id
FOR UPDATE;

SELECT ledger.* INTO v_ledger
FROM billing_wallet_ledger AS ledger
WHERE ledger.user_id = p_user_id
  AND ledger.idempotency_key = p_idempotency_key;

SELECT wallet.* INTO v_wallet
FROM billing_wallets AS wallet
WHERE wallet.user_id = p_user_id
FOR UPDATE;

FOR v_grant IN
  SELECT credit_grant.*
  FROM billing_wallet_credit_grants AS credit_grant
  WHERE credit_grant.wallet_id = v_wallet.id
    AND credit_grant.status = 'active'
    AND (credit_grant.expires_at IS NULL OR credit_grant.expires_at > now())
    AND credit_grant.remaining_credits > credit_grant.reserved_credits
  ORDER BY credit_grant.expires_at ASC NULLS LAST,
           credit_grant.created_at ASC,
           credit_grant.id ASC
  FOR UPDATE
LOOP
  UPDATE billing_wallet_credit_grants AS credit_grant
  SET reserved_credits = credit_grant.reserved_credits + v_take,
      updated_at = now()
  WHERE credit_grant.id = v_grant.id;
END LOOP;

UPDATE billing_wallets AS wallet
SET reserved_credits = wallet.reserved_credits + p_amount,
    updated_at = now()
WHERE wallet.id = v_wallet.id;
~~~

The migration must wrap those statements with:

~~~sql
GRANT USAGE, CREATE ON SCHEMA app TO tapflow_wallet_callback;
GRANT tapflow_wallet_callback TO CURRENT_USER WITH INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
SET LOCAL ROLE tapflow_wallet_callback;
-- CREATE OR REPLACE FUNCTION app.wallet_reserve with the full signature and body described above.
REVOKE ALL ON FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb) TO SESSION_USER;
RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;
REVOKE tapflow_wallet_callback FROM CURRENT_USER GRANTED BY CURRENT_USER;
~~~

- [ ] **Step 2: Run the focused test and verify GREEN.**

Run:

~~~bash
npm test -- packages/db/test/personal-wallet-migration-sql.test.ts -t "qualifies wallet reserve columns"
~~~

Expected result: the focused test passes with zero failures.

### Task 3: Run database and cross-service validation

**Files:**
- Modify: PROJECT_RECORD.md

- [ ] **Step 1: Run focused database tests.**

~~~bash
npm run test --workspace @aigc-flow/db -- personal-wallet-migration-sql.test.ts personal-wallet.test.ts
~~~

Expected result: source-level tests pass; database-backed integration tests may be skipped when no test database is configured.

- [ ] **Step 2: Run database, API, and worker builds/tests.**

~~~bash
npm run build --workspace @aigc-flow/db
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/worker
npm run test --workspace @aigc-flow/api
npm run test --workspace @aigc-flow/worker
~~~

Report any already documented environment-dependent failures exactly.

- [ ] **Step 3: Record migration and validation evidence.**

Append a dated PROJECT_RECORD.md entry with the migration filename, the prior PostgreSQL 42702 symptom, focused test results, build results, and staging smoke status. Do not rewrite existing entries.

- [ ] **Step 4: Run the full repository build.**

~~~bash
npm run build
~~~

Expected result: exit code zero with only previously documented warnings, if any.

### Task 4: Staging migration and runtime smoke

- [ ] **Step 1: Build images and stop the worker.**

~~~bash
cd /opt/aittco/tapflow
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-worker
~~~

- [ ] **Step 2: Run the compiled migration once.**

~~~bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-api node packages/db/dist/cli.js
~~~

Expected result: 000055_wallet_reserve_qualified_columns.sql is applied, not skipped.

- [ ] **Step 3: Start services and inspect status.**

~~~bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml ps
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml logs --tail=100 tapflow-api tapflow-worker
~~~

- [ ] **Step 4: Run a rolled-back reserve smoke test.**

Using the staging API database connection, set app.tenant_id and app.user_id, call app.wallet_reserve for a small amount inside an explicit BEGIN transaction followed by ROLLBACK, and assert it no longer returns 42702. Confirm wallet balance, reservation, and ledger counts are unchanged after rollback.

- [ ] **Step 5: Generate one image from the canvas.**

Confirm the browser POST returns 201, the workflow reaches the worker, ai_call_logs records the selected route, the generated asset is persisted, and the wallet reserve is settled or refunded. If the next error is PROVIDER_*, diagnose provider configuration separately.
