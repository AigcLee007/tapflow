# Wallet Completion Runtime Recovery Design

## Context

Staging workflow run `51f9a568-9506-4d28-b7a5-ab7da089a19e` now passes
credit reservation and image-job enqueue. The worker consumes the image job,
creates provider task `1481a574daa242e497ad2e32fdda4091`, and then repeatedly
fails while processing `provider.poll` with PostgreSQL reporting that the
current transaction is aborted.

Two deterministic defects are present in the current source:

- `app.wallet_settle_or_refund` still uses unqualified names such as
  `user_id`, `tenant_id`, `usage_event_id`, and `idempotency_key`. Those names
  also exist as `RETURNS TABLE` output variables, so PostgreSQL can raise
  `42702` when the worker settles a completed provider result.
- The runtime database role is not granted `EXECUTE` on
  `app.wallet_expire_due(integer, timestamptz)`, although the worker schedules
  that function every five minutes.

The worker catches provider-processing errors inside the same database
transaction. If the original error is a PostgreSQL statement error, the
transaction is already aborted, so the failure/refund writes raise `25P02` and
mask the original error. The node remains in `waiting_provider` and the canvas
continues to display a generating state.

## Goals

- Allow successful provider results to settle personal-wallet reservations.
- Allow the worker runtime role to execute the global wallet-expiry sweep.
- Preserve the original execution or polling error instead of replacing it
  with `current transaction is aborted`.
- Ensure failed work is marked failed and open reservations are refunded.
- Recover the existing stuck staging run without creating another reservation
  or deleting queue history.

## Non-Goals

- Redesigning the personal-wallet accounting model.
- Moving provider calls outside database transactions in this repair.
- Changing provider routes, credentials, pricing, or model selection.
- Clearing Redis, deleting failed jobs, or mutating historical ledger rows.

## Database Design

Add one forward-only migration after `000057`.

The migration will replace `app.wallet_settle_or_refund` while preserving its
signature, `SECURITY DEFINER` behavior, callback-role ownership model,
idempotency checks, reservation allocation updates, expiry-aware refund logic,
ledger inserts, and wallet balance updates. Every table reference that can
collide with an output variable will use an alias and every affected column
reference will be qualified.

The migration will revoke public access and grant the configured runtime API
role `EXECUTE` on both:

```text
app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb)
app.wallet_expire_due(integer, timestamptz)
```

The runtime role will be resolved using the existing
`app.api_database_role`/`SESSION_USER` pattern. No financial table privileges
will be granted to the runtime role.

## Worker Transaction Recovery

Both provider-result paths must tolerate a PostgreSQL statement failure:

- synchronous completion in node execution;
- asynchronous completion in `provider.poll`.

Each path will establish a named PostgreSQL savepoint before the block that
can persist provider output and settle billing. On failure it will:

1. retain the original error value;
2. roll back to and release the savepoint;
3. run the existing failure/refund transition on a usable transaction;
4. commit the failed workflow state and refund records;
5. rethrow the original error so BullMQ and logs retain the real PostgreSQL
   code/message.

Successful paths may release the savepoint explicitly before returning. The
change will not alter provider polling delays, attempts, concurrency, queue
names, or billing idempotency keys.

## Existing Run Recovery

After deployment and migration, inspect the exact workflow and node-run state.
If the node is still `waiting_provider`, enqueue one `provider.poll` job using
the already persisted tenant ID, node-run ID, workflow-run ID, and provider
task ID. This resumes provider reconciliation and does not reserve credits
again.

If the provider reports success, normal asset persistence and settlement will
complete the run. If it reports failure or the result cannot be recovered, the
new transaction recovery path will mark the run failed and refund the open
reservation. The operator must not create a replacement run until this state
is reconciled.

## Diagnostics

Worker error logging will include the original error message and, when
available, PostgreSQL `code`, `constraint`, `detail`, and `table`. It must not
log credentials, connection URLs, authorization headers, or provider secrets.

## Tests

Test-driven implementation will add focused regression coverage that fails
before the production change:

- migration SQL requires qualified settlement table references;
- migration SQL grants both runtime function signatures without granting
  financial table writes;
- synchronous execution rolls back to a savepoint before failure/refund writes;
- asynchronous polling rolls back to a savepoint before failure/refund writes;
- the original database error is rethrown after the failed state is persisted.

Required validation:

```text
npm run test --workspace @aigc-flow/db -- personal-wallet-migration-sql.test.ts personal-wallet.test.ts
npm run test --workspace @aigc-flow/worker
npm run build --workspace @aigc-flow/db
npm run build --workspace @aigc-flow/worker
npm run build
```

## Deployment And Rollback

Deployment follows the documented Docker Compose v2 order: pull, build, stop
worker, run the compiled migrator once, start services, inspect logs, then
recover the exact stuck run.

Rollback should redeploy the previous application commit only after stopping
the worker. The database migration is forward-compatible and should normally
remain applied because it preserves the existing function contract and only
narrows ambiguous SQL plus restores intended runtime execution grants.
