# Usage Event Settlement Status Design

## Goal

Ensure completed image, video, and text generations appear as `已结算` in the billing activity feed, while safely backfilling historical events that were settled financially but left with a `pending` usage-event status.

## Scope

- Update the success path for Flow Worker generations.
- Update the success path for workbench image generations.
- Add a guarded historical backfill for events with a matching personal-wallet `settle` ledger entry.
- Preserve the existing billing-feed deduplication behavior.
- Do not change active reservation accounting or attempt to repair the separate `13.6` reserved-credit issue.

## Design

### Runtime status synchronization

The successful generation transaction already creates a `usage_events` row and then calls the personal-wallet settlement function. After settlement returns, the same transaction will update that usage event to `status = 'settled'`. The update is keyed by the returned usage-event id and billed user ownership, and only changes rows currently in `pending` (or the equivalent unfinished state) so retries remain harmless.

Both runtime callers will use the same helper or equivalent SQL contract:

1. Insert or load the usage event through the existing idempotent API.
2. Settle the matching personal-wallet reservation through the existing idempotent wallet API.
3. Mark the usage event settled.
4. Persist the node/generation settlement metadata as today.

All operations remain in the existing transaction. A failure rolls back the usage status and wallet mutation together.

### Historical backfill

Add a forward-only, idempotent database migration or repository migration utility that updates only events satisfying all of these conditions:

- `usage_events.status = 'pending'`;
- a personal-wallet ledger row exists with `entry_type = 'settle'` and `usage_event_id = usage_events.id`;
- the settlement ledger belongs to the same billed user;
- no conflicting refund state is present.

The backfill must not infer completion from timestamps, modality, node status, or negative credits alone. It must not alter events without a matching settlement ledger. The update should report the number of rows changed so deployment verification can confirm its effect.

### Billing display

No new frontend status mapping is required. The existing mapping already renders `settled` as `已结算`; the existing ledger deduplication continues to hide a matching settle row so one generation remains one creator-facing activity row.

## Error Handling and Idempotency

- Runtime updates use the existing transaction and idempotency keys.
- Replayed worker jobs must leave an already-settled usage event unchanged.
- Historical backfill is safe to rerun because the predicate excludes already-settled rows.
- Events with only a reserve ledger remain untouched and continue to represent unfinished or unresolved work.

## Testing

- Add a failing regression test proving a successful Flow Worker billing completion updates the usage event to `settled`.
- Add a failing regression test for the workbench completion path.
- Add migration/SQL tests proving the backfill predicate requires a matching settle ledger and same user, and does not touch pending-only events.
- Run focused tests, the relevant workspace tests, and `npm run build`.

## Out of Scope

- Releasing or reconciling the separate `13.6` reserved credits.
- Changing the visual wording or layout of the billing page.
- Reclassifying failed generations that have no usage event.
