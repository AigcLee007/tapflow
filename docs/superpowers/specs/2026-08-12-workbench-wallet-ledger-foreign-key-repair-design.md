# Workbench Personal Wallet Ledger Foreign Key Repair

Date: 2026-08-12
Status: Approved for implementation

## Problem

The workbench generation API now reserves credits through the personal-wallet billing path. That path returns IDs from `billing_wallet_ledger`, while the three billing reference columns on `workbench_generations` still reference the legacy `billing_ledger` table:

- `reserve_ledger_id`
- `settle_ledger_id`
- `refund_ledger_id`

As a result, a new workbench generation fails while inserting its reserved ledger ID with PostgreSQL SQLSTATE `23503`. The API transaction rolls back and exposes the generic `INTERNAL_ERROR` response before a provider job is enqueued.

## Chosen Design

Add migration `000067_workbench_personal_wallet_ledger_fks.sql`. The migration will:

1. Drop the existing foreign key constraints for all three workbench ledger columns.
2. Recreate each constraint against `billing_wallet_ledger(id)`.
3. Keep the existing `ON DELETE SET NULL` behavior.
4. Create the replacement constraints as `NOT VALID`.

PostgreSQL still checks a `NOT VALID` foreign key for every new or updated row. It only skips the initial scan of existing rows. This allows historical workbench generations whose IDs legitimately came from `billing_ledger` to remain readable while enforcing the personal-wallet relationship for all future writes.

No API, worker, frontend, billing calculation, or queue contract changes are required. Those components already pass personal-wallet ledger IDs consistently.

## Alternatives Considered

### Add Separate Personal-Wallet Columns

This would preserve explicit legacy and current relationships, but it requires API and worker changes, data mapping decisions, and a longer compatibility period. It is unnecessary for restoring the current product path.

### Remove the Foreign Keys

This would restore submissions but eliminate database integrity for new billing references. It is rejected because workbench billing records should remain tied to a real personal-wallet ledger row.

### Rewrite Historical IDs

Legacy billing IDs cannot be safely translated to personal-wallet ledger IDs without changing historical accounting semantics. This is rejected.

## Data and Runtime Behavior

After migration:

1. The API reserves credits in the personal wallet.
2. The returned `billing_wallet_ledger.id` is accepted as `reserve_ledger_id` when the generation is inserted.
3. The worker may store personal-wallet settlement or refund IDs in the corresponding columns.
4. Old workbench rows remain accessible without forced data rewriting.

If generation submission fails for any other reason, the existing transaction and compensation behavior remains unchanged.

## Testing

Add a focused database migration contract test before writing the migration. It must verify that migration `000067`:

- drops all three legacy foreign key constraints;
- recreates all three constraints against `billing_wallet_ledger(id)`;
- preserves `ON DELETE SET NULL`;
- uses `NOT VALID` to tolerate historical legacy IDs.

Then run the focused test, the database workspace tests, relevant workbench API tests, database and API builds, and the root build. A deployed environment should additionally run a rolled-back insert probe and one authenticated workbench generation smoke test.

## Deployment and Rollback

Deploy through the existing Docker Compose v2 flow. Build images, stop the worker, run `node packages/db/dist/cli.js` once, and then restart Redis, API, worker, and frontend.

The SQL migration is forward-only. Operational rollback should redeploy the prior application version only if it remains compatible with the personal-wallet schema. If the migration itself must be reversed, stop the worker first and apply an explicitly reviewed corrective migration; do not rewrite historical billing rows or delete ledger entries.

## Acceptance Criteria

- Workbench submissions accept a personal-wallet reserve ledger ID.
- Successful jobs can store a personal-wallet settlement ledger ID.
- Failed or canceled jobs can store a personal-wallet refund ledger ID.
- Existing workbench history remains readable.
- New ledger references are still enforced by PostgreSQL.
- No balance mutation occurs in the frontend.
- Required tests and builds pass, or an environment-specific failure is documented exactly.
