# Workbench Personal Wallet Ledger Foreign Key Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make new workbench generations accept personal-wallet ledger IDs for reserve, settlement, and refund while preserving historical rows that reference the legacy billing ledger.

**Architecture:** Add one forward-only PostgreSQL migration after `000066`. It drops the three legacy foreign keys on `workbench_generations` and recreates them against `billing_wallet_ledger(id)` with `ON DELETE SET NULL NOT VALID`, so new writes are checked without forcing a historical data rewrite. Add a migration SQL contract test first, then update the project record after verification.

**Tech Stack:** PostgreSQL migration SQL, Vitest, npm workspaces, TypeScript build, Docker Compose v2 deployment.

---

### Task 1: Add the failing migration contract test

**Files:**
- Create: `packages/db/test/workbench-wallet-ledger-fks.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../migrations/000067_workbench_personal_wallet_ledger_fks.sql",
);

describe("workbench personal wallet ledger foreign key migration", () => {
  test("repoints reserve, settle, and refund references to the personal wallet ledger", async () => {
    const sql = await readFile(migrationPath, "utf8");

    for (const constraint of [
      "workbench_generations_reserve_ledger_id_fkey",
      "workbench_generations_settle_ledger_id_fkey",
      "workbench_generations_refund_ledger_id_fkey",
    ]) {
      expect(sql).toContain(`DROP CONSTRAINT IF EXISTS ${constraint}`);
    }

    expect(sql).toMatch(
      /reserve_ledger_id[^;]+REFERENCES billing_wallet_ledger\s*\(id\)[^;]+ON DELETE SET NULL[^;]+NOT VALID/s,
    );
    expect(sql).toMatch(
      /settle_ledger_id[^;]+REFERENCES billing_wallet_ledger\s*\(id\)[^;]+ON DELETE SET NULL[^;]+NOT VALID/s,
    );
    expect(sql).toMatch(
      /refund_ledger_id[^;]+REFERENCES billing_wallet_ledger\s*\(id\)[^;]+ON DELETE SET NULL[^;]+NOT VALID/s,
    );
    expect(sql).not.toMatch(/workbench_generations_[a-z]+_ledger_id_fkey[^\n]*billing_ledger\s*\(id\)/);
  });
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm run test --workspace @aigc-flow/db -- workbench-wallet-ledger-fks.test.ts
```

Expected: FAIL because migration `000067_workbench_personal_wallet_ledger_fks.sql` does not exist yet.

### Task 2: Add the forward-only migration

**Files:**
- Create: `packages/db/migrations/000067_workbench_personal_wallet_ledger_fks.sql`

- [x] **Step 1: Write the minimal migration**

```sql
ALTER TABLE workbench_generations
  DROP CONSTRAINT IF EXISTS workbench_generations_reserve_ledger_id_fkey,
  DROP CONSTRAINT IF EXISTS workbench_generations_settle_ledger_id_fkey,
  DROP CONSTRAINT IF EXISTS workbench_generations_refund_ledger_id_fkey;

ALTER TABLE workbench_generations
  ADD CONSTRAINT workbench_generations_reserve_ledger_id_fkey
    FOREIGN KEY (reserve_ledger_id)
    REFERENCES billing_wallet_ledger(id)
    ON DELETE SET NULL
    NOT VALID,
  ADD CONSTRAINT workbench_generations_settle_ledger_id_fkey
    FOREIGN KEY (settle_ledger_id)
    REFERENCES billing_wallet_ledger(id)
    ON DELETE SET NULL
    NOT VALID,
  ADD CONSTRAINT workbench_generations_refund_ledger_id_fkey
    FOREIGN KEY (refund_ledger_id)
    REFERENCES billing_wallet_ledger(id)
    ON DELETE SET NULL
    NOT VALID;
```

- [x] **Step 2: Run the focused test and verify it passes**

Run:

```bash
npm run test --workspace @aigc-flow/db -- workbench-wallet-ledger-fks.test.ts
```

Expected: PASS.

### Task 3: Run focused accounting and workbench coverage

**Files:**
- Read-only verification of `packages/db/test/personal-wallet*.test.ts`, `apps/api/test/workbench-service.test.ts`, `apps/api/test/personal-wallet-charging-cutover.test.ts`, and `apps/worker/test/workbench-generation.service.test.ts`.

- [x] **Step 1: Run database tests**

```bash
npm run test --workspace @aigc-flow/db
```

Expected: PASS. If a test needs unavailable local PostgreSQL, record its exact infrastructure error and continue with all non-integration tests.

- [x] **Step 2: Run workbench API and worker tests**

```bash
npm run test --workspace @aigc-flow/api -- workbench-service.test.ts personal-wallet-charging-cutover.test.ts
npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts
```

Expected: PASS.

### Task 4: Build affected packages and the product

**Files:**
- No additional source files.

- [x] **Step 1: Build the database package**

```bash
npm run build --workspace @aigc-flow/db
```

Expected: PASS.

- [x] **Step 2: Build the API package**

```bash
npm run build --workspace @aigc-flow/api
```

Expected: PASS.

- [x] **Step 3: Run the root build**

```bash
npm run build
```

Expected: PASS.

### Task 5: Update the project record

**Files:**
- Modify: `PROJECT_RECORD.md` at the current diagnostic entry for the workbench personal-wallet foreign key failure.

- [x] **Step 1: Replace diagnosis-only wording with implementation status**

Add the migration filename, explain that all three ledger foreign keys now target `billing_wallet_ledger(id)` as `NOT VALID` for historical compatibility, and list the exact focused tests/build commands that passed. State that production deployment and smoke generation remain pending explicit operational execution.

- [x] **Step 2: Verify only task files are staged**

```bash
git status --short
git diff -- packages/db/migrations/000067_workbench_personal_wallet_ledger_fks.sql packages/db/test/workbench-wallet-ledger-fks.test.ts PROJECT_RECORD.md
```

Expected: only the new migration, focused test, and project record appear as task changes; preserve unrelated user files.

### Task 6: Prepare the operational handoff

- [x] **Step 1: Provide the approved Compose v2 deployment sequence**

Use `/opt/aittco/tapflow`, `/opt/aittco/env/tapflow.staging.env`, `docker-compose.staging.yml`, stop the worker before migration, run `node packages/db/dist/cli.js`, then start Redis/API/worker/frontend.

- [x] **Step 2: State production verification still required**

After an authorized deployment, perform a rolled-back insert probe using a real personal-wallet reserve ledger ID and one authenticated workbench generation. Do not deploy or mutate production in this implementation task without explicit authorization.
