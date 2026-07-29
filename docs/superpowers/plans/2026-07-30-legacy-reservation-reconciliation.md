# Legacy Reservation Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Release the 32 terminal-failed legacy credit reservations and the 200-credit orphan grant reservation so personal-wallet cutover can pass its zero-reservation verification.

**Architecture:** Reuse `BillingService.refundUsageWithClient` for each reservation so every release creates an immutable legacy refund ledger entry and is idempotent. Add a dedicated reconciliation module/CLI for terminal workflow reservations and orphan grant counter repair; the CLI is dry-run by default and requires an explicit confirmation token for writes.

**Tech Stack:** TypeScript, `pg`, Vitest, existing v2 PostgreSQL schema and Docker Compose migrator image.

---

### Task 1: Lock current refund behavior with tests

**Files:**
- Modify: `packages/db/test/billing.test.ts`
- Modify: `packages/db/test/personal-wallet-migration.test.ts`

- [ ] Add a regression test showing a legacy refund releases the linked credit reservation and grant reserved counter.
- [ ] Add reconciliation report tests for terminal failed rows, orphan grant discrepancies, dry-run rollback, and idempotent write keys.
- [ ] Run the focused tests and confirm they fail before implementation.

### Task 2: Fix legacy refund reservation release

**Files:**
- Modify: `packages/db/src/billing.ts`
- Modify: `packages/db/test/billing.test.ts`

- [ ] Call the existing `refundCreditReservations` helper from the refund ledger mutation with the reserve ledger id in metadata.
- [ ] Preserve existing account refund behavior and idempotency semantics.
- [ ] Run the billing tests and confirm they pass.

### Task 3: Add guarded legacy reconciliation CLI

**Files:**
- Create: `packages/db/src/personal-wallet-reconciliation.ts`
- Create: `packages/db/src/personal-wallet-reconciliation-cli.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/package.json`
- Modify: `packages/db/test/personal-wallet-migration.test.ts`

- [ ] Report all active reservations, workflow/node status, total reservation credits, and grant counter discrepancies.
- [ ] In write mode, refund only reservations linked to terminal failed/canceled workflow runs using idempotency key `reconcile:legacy-reservation-refund:<reservationId>`.
- [ ] Repair only positive orphan grant reserved counters, create a zero-amount audit ledger entry with idempotency key `reconcile:legacy-orphan-grant:<grantId>`, and decrement the matching legacy billing account reserved counter.
- [ ] Wrap the write in a transaction, lock affected rows, and reject any non-terminal or ambiguous reservation before mutation.
- [ ] Require `--write --confirm LEGACY_RESERVATION_RECONCILIATION`.

### Task 4: Verify and document deployment

**Files:**
- Modify: `docs/PRODUCTION_RUNBOOK.md`
- Modify: `docs/staging-runbook.md`
- Modify: `PROJECT_RECORD.md`

- [ ] Build the database package and run focused plus full database tests.
- [ ] Build the root frontend/API artifacts required by the migrator image.
- [ ] Push the implementation and provide commands to pull, build, run reconciliation dry-run/write, rerun wallet dry-run, and perform the confirmed wallet cutover.

