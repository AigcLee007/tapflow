# Wallet Reserve Qualified Columns Design

## Problem

Canvas image generation fails before worker enqueue because workflow creation calls `app.wallet_reserve(...)`, which raises PostgreSQL error `42702`: `column reference "user_id" is ambiguous`. The function returns a table containing `user_id` and `idempotency_key`, while its PL/pgSQL statements reference columns with the same names without table qualification.

The API maps the database error to `WALLET_RESERVE_FAILED` and then returns the generic creator-facing `INTERNAL_ERROR` response. No provider request occurs, and no workflow run survives because the creation transaction rolls back.

## Scope

The repair will:

- add a forward-only `000055_wallet_reserve_qualified_columns.sql` migration;
- recreate only `app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb)`;
- qualify every table column that can collide with a PL/pgSQL variable or output parameter;
- preserve the personal-wallet schema, RLS boundaries, callback-role ownership, function signature, idempotency behavior, FEFO grant allocation, and reserve ledger semantics;
- add focused SQL regression coverage and update the project record.

The repair will not modify historical migration `000045`, restore legacy tenant billing, change pricing, alter AI Gateway routes, rotate credentials, or change creator UI behavior.

## Migration Design

The migration will temporarily grant the existing `tapflow_wallet_callback` role the schema privileges required to replace its owned function, set that role locally, and recreate `app.wallet_reserve` with explicit aliases:

- `billing_wallets AS wallet`
- `billing_wallet_ledger AS ledger`
- `billing_wallet_credit_grants AS credit_grant`
- `billing_wallet_credit_reservations AS reservation`

All predicates and updates will reference qualified columns, including the idempotency lookup, wallet locks, active grant selection, grant reservation update, and cached wallet total update. The function will continue returning the same nine-column ledger projection.

After replacement, the migration will restore function execution rights for the runtime role and remove the temporary callback-role membership/schema-create capability using the established wallet migration pattern.

## Error Handling

Known domain errors remain unchanged:

- insufficient usable balance raises `INSUFFICIENT_BALANCE` and maps to HTTP 402;
- reuse of an idempotency key with different reserve data raises `WALLET_IDEMPOTENCY_CONFLICT` and maps to HTTP 409;
- unexpected database failures remain `WALLET_RESERVE_FAILED`.

The fix removes only the erroneous PostgreSQL ambiguity failure.

## Testing

TDD will add a focused migration-source regression test before the migration exists. The red assertion will require:

- creation of `000055_wallet_reserve_qualified_columns.sql`;
- recreation of `app.wallet_reserve`;
- qualified wallet, ledger, and grant references;
- preservation of callback-role ownership and runtime execution grants.

After the migration is implemented, validation will include:

- the focused personal-wallet migration SQL test;
- the database workspace test suite;
- API and worker tests because reserve/settle/refund cross those service boundaries;
- `npm run build`;
- a staging rolled-back call to `app.wallet_reserve` proving the previous `42702` no longer occurs;
- one real canvas image generation proving reserve, enqueue, provider execution, asset persistence, and settle/refund behavior.

## Deployment

Deployment follows the v2 Compose order: build images, stop the worker, run `node packages/db/dist/cli.js` once, then start Redis, API, worker, and frontend. The migration is additive and does not delete wallet, ledger, workflow, or AI route history.

