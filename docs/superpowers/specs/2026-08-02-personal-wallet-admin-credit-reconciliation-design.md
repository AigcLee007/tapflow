# Personal Wallet Admin Credit Reconciliation Design

**Date:** 2026-08-02

**Status:** Approved design, pending implementation plan

## Problem

The production billing surface currently exposes three incompatible balances for the same user:

- redeem codes and creator billing read the personal wallet;
- administrator grants and adjustments still mutate the legacy tenant billing account;
- the canvas toolbar calls the personal-wallet summary API but reads the removed legacy response shape and falls back to zero.

For `aigclee@sina.com`, a 1,000-credit redeem entered the personal wallet, while three administrator operations totaling 2,100 credits entered the legacy tenant account. With no usage, reservation, or expiry, the intended personal balance is 3,100 credits.

This is a cutover defect. It is not an intentional separation of creator balances.

## Goals

- Make one personal wallet per `user_id` the only spendable balance across all workspaces.
- Move all future administrator credit and debit operations to the target user's personal wallet.
- Reconcile every unambiguous administrator operation that was written to the legacy ledger after the personal-wallet cutover.
- Preserve original credit expiration dates and immutable audit history.
- Make billing, account chrome, workbench, canvas, and administrator views report the same balance.
- Make the reconciliation idempotent, dry-run first, fail-closed, and safe to repeat.

## Non-Goals

- Do not delete or rewrite legacy tenant billing history.
- Do not restore tenant-owned spendable balances.
- Do not combine legacy and personal balances in frontend code.
- Do not change pricing, reserve, settle, refund, payment, or redeem semantics beyond consuming the same personal wallet.
- Do not infer a target user when legacy evidence is incomplete.

## Chosen Architecture

`billing_wallets` is the sole authoritative balance. A wallet belongs to one user and is available from every workspace that user can access. Workspace identifiers on personal-wallet ledger rows are attribution only.

The legacy `billing_accounts`, `billing_credit_grants`, and `billing_ledger` tables remain read-only history after this cutover. No normal administrator endpoint may create new balance mutations in those tables.

The existing worker and workflow paths already reserve, settle, and refund through `PersonalWalletService`; they remain unchanged except for focused contract cleanup and regression tests.

## Administrator Operations

### Credit

`AdminApiService.grantCredits` and the positive branch of `adjustCredits` must credit `input.targetUserId`, not the administrator actor and not a tenant account.

The legacy `/api/v2/billing/admin/adjust` route must not remain a second balance mutation path. It must either be removed from the normal product surface or delegate to the same target-user personal-wallet operation with the same authorization, idempotency, expiry, and audit rules. No route may continue calling `BillingApiService.adjustBillingAccount` for spendable credits.

Each credit creates:

- one personal-wallet ledger row with `entry_type = 'admin_credit'`;
- one personal-wallet credit-grant batch with `source_type = 'admin_grant'`;
- the requested original expiration timestamp;
- metadata containing `adminActorUserId`, `targetUserId`, `tenantId`, reason, validity mode, and the administrator request idempotency key.

The selected `tenantId` must still identify a workspace in which the target user has an active membership. It is retained as audit attribution and does not scope spendability.

### Debit

Add a personal-wallet administrator debit operation and permit `admin_debit` in the personal-wallet ledger constraint. The operation must:

- authorize the administrator before entering the wallet mutation;
- lock the target wallet and relevant active grant batches;
- expire due grants first;
- reject amounts above `balance_credits - reserved_credits`;
- consume unreserved grant amounts in FEFO order;
- create one idempotent `admin_debit` ledger row;
- leave active reservations untouched;
- record the actor, target, workspace attribution, reason, and exact grant allocations.

The ledger stores a positive absolute amount. The entry type determines that the display and accounting direction are negative.

### API Responses

Administrator credit and debit responses return the target user's current personal-wallet summary. Administrator user responses expose one user-level wallet summary rather than repeating a tenant balance inside each membership.

Membership records retain workspace role, status, membership tier, and workspace-attributed usage. They no longer present `billing_accounts.balance_cents` as the user's spendable credits.

Batch wallet-summary loading must be used for administrator user lists to avoid one query per user.

## Frontend Contract

The v2 billing summary contract is the existing flat personal-wallet response:

```ts
type BillingSummary = {
  availableCredits: number;
  balanceCredits: number;
  expiringSoonCredits: number;
  nearestExpiryAt: string | null;
  reservedCredits: number;
  walletId: string;
};
```

Remove runtime access to legacy nested fields such as `account.balanceCents`, `account.reservedCents`, and `creditGrants.availableCredits`.

Billing, account chrome, workbench, and canvas use a shared personal-wallet summary hook. It refreshes on authentication changes, successful wallet mutations, and document visibility regain. A failed request displays an unavailable state such as `--`; it must not silently present zero.

The administrator UI labels the value `Personal wallet balance` in the localized interface and updates from the mutation response immediately.

## Historical Reconciliation

### Source Mapping

Create a guarded reconciliation CLI for administrator mutations that remained in the legacy ledger after personal-wallet cutover.

An eligible legacy credit requires all of the following:

- `billing_ledger.entry_type = 'admin_credit'`;
- a valid `metadata.targetUserId`;
- a linked legacy credit grant through the ledger idempotency key/source id;
- no personal-wallet migration ledger row with idempotency key `migration:tenant-grant:<legacyGrantId>`;
- no personal-wallet reconciliation ledger row for that legacy ledger id.

An eligible legacy debit requires:

- `billing_ledger.entry_type = 'admin_debit'`;
- a valid `metadata.targetUserId`;
- a creation time after the recorded personal-wallet migration watermark;
- complete `creditGrantAllocations` metadata;
- no personal-wallet reconciliation ledger row for that legacy ledger id.

Every destination row uses a stable idempotency key:

```txt
wallet-reconcile:admin:<legacyBillingLedgerId>
```

Destination metadata records the legacy ledger id, legacy grant ids, original idempotency key, target user, tenant attribution, operation time, and reconciliation run identifier. The legacy row is never modified.

### Expiration and Allocations

Credits retain their original `expires_at`. A credit already expired at reconciliation time does not increase current available balance. Its legacy history remains available for audit and it is reported as expired/skipped.

Debit reconciliation follows the exact legacy `creditGrantAllocations` mapping. Each legacy source grant is mapped either to its original migration-created wallet grant or to the wallet grant created by this reconciliation. If a destination grant is missing or no longer has enough unreserved credits, the row is unresolved and write mode is blocked.

This preserves grant provenance and avoids applying a current FEFO debit that could differ from the historical allocation.

### Dry-Run Report

Dry-run is mandatory and performs no persistent changes. It reports:

- cutover watermark and reconciliation run id;
- affected users and workspaces;
- opening personal balance;
- credits to add;
- debits to apply;
- expired credits skipped;
- already-migrated and already-reconciled records skipped;
- unresolved records with machine-readable reasons;
- expected closing personal balance;
- source and destination control totals.

For the reported account, acceptance requires a row equivalent to:

```txt
aigclee@sina.com: opening=1000 credit=2100 debit=0 expected=3100 unresolved=0
```

### Write Mode

Write mode requires an explicit confirmation token and runs in a repeatable-read transaction with the relevant wallet and grant rows locked. It is allowed only when:

- `unresolved = 0`;
- source and expected destination totals match;
- no active mutation is racing the reconciliation;
- a dry-run from the same deployed revision has been reviewed.

Re-running after success must produce zero pending mutations and unchanged balances.

## Error Handling

- Administrator debit above unreserved balance returns `INSUFFICIENT_BALANCE` and changes nothing.
- Reused idempotency keys with different targets, amounts, direction, or expiry return a conflict.
- Missing or inactive target membership returns the existing membership error before wallet mutation.
- Missing wallet summary data is an error state, not a zero balance.
- Reconciliation ambiguity blocks the complete write run and identifies the source row; it never guesses a user or amount.
- Audit logging failures follow the existing policy, but a successful financial mutation must retain enough wallet-ledger metadata to reconstruct the actor and source.

## Test Strategy

### Database

- Personal-wallet administrator credit creates one grant and one ledger row.
- Credit and debit are idempotent under retries and concurrent requests.
- Debit preserves reservations and rejects insufficient unreserved balance.
- Debit consumes FEFO grants and persists exact allocations.
- Expired grants are not spendable.
- RLS prevents cross-user wallet access outside authorized system-admin paths.
- Migration SQL permits `admin_debit` without weakening existing ledger constraints or function ACLs.

### API

- Administrator credit changes the target user's wallet and not the actor's wallet.
- Administrator debit changes the target user's wallet and respects permissions.
- The legacy billing-admin adjustment route is removed or delegates to the personal-wallet path and cannot mutate `billing_accounts`.
- Redeem 1,000, administrator grant 2,000, and administrator adjustment 100 produce a 3,100 summary.
- Administrator user search returns the same wallet total as `/api/v2/billing/summary` for the target user.
- Tenant selection remains required for membership validation and audit attribution.

### Reconciliation

- Dry-run is read-only.
- Initial cutover migrations are excluded by source-grant idempotency markers.
- Repeated write mode is a no-op.
- Original expiration is preserved.
- Already-expired credits do not increase balance.
- Missing target, source, allocation, or available destination grant blocks write mode.
- Mixed credit/debit source totals match destination changes.

### Frontend

- Billing, account chrome, workbench, canvas, and administrator UI render the flat summary contract.
- A 3,100 response renders 3,100 in each surface.
- Canvas summary failures render unavailable state rather than zero.
- Successful redeem and administrator mutation invalidate the shared snapshot.
- Tests no longer mock the removed nested billing response.

### Required Commands

```bash
npm run build
npm run test --workspace @aigc-flow/db
npm run test --workspace @aigc-flow/api
npm run test --workspace @aigc-flow/worker
npm test
```

Database-backed tests may be reported as skipped only when the required local database environment is unavailable; staging dry-run and acceptance remain mandatory.

## Deployment

This financial cutover requires a maintenance window that is stricter than the normal migration sequence:

1. Back up and record personal-wallet and legacy-ledger control totals.
2. Build the Docker Compose v2 images from `docker-compose.staging.yml`.
3. Stop `tapflow-api` and `tapflow-worker` to freeze administrator writes and workflow charges.
4. Run the compiled migration entry point: `node packages/db/dist/cli.js`.
5. Run the compiled reconciliation CLI in dry-run mode.
6. Review totals, require `unresolved=0`, and verify the 1,000 + 2,100 = 3,100 account result.
7. Run the reconciliation CLI in confirmed write mode.
8. Re-run dry-run and require zero pending mutations.
9. Start Redis, API, Worker, and frontend.
10. Verify health, logs, all four balance surfaces, and one minimal real generation through reserve and settle.
11. Record migration identifiers, reports, validation, and staging outcome in `PROJECT_RECORD.md`.

## Rollback

The schema migration is additive and forward-compatible. Legacy ledgers remain intact.

If application behavior fails, disable administrator credit operations, stop the worker when charging behavior is affected, and redeploy the previous application revision. Do not delete or rewrite successful personal-wallet ledger entries. Any required financial correction must be a new, explicit reversal entry with its own idempotency key and audit metadata.

If dry-run validation fails, do not enter write mode and do not enable the new administrator wallet controls.

## Acceptance Criteria

- All future administrator changes affect only the target user's personal wallet.
- No normal production path writes new spendable credits to legacy tenant accounts.
- Reconciliation is repeatable and produces no unresolved records before write mode.
- `aigclee@sina.com` reaches 3,100 available credits when no usage, reservation, or expiry applies.
- Billing page, account menu, workbench, canvas, and administrator page display the same available balance.
- A real generation reserves and settles against that same wallet.
- Build and relevant DB/API/Worker/frontend tests pass.
- Deployment and reconciliation evidence is recorded in `PROJECT_RECORD.md`.
