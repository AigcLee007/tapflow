# Billing Redeem and Payment Status Sync Fix

## Context

Two production billing defects were confirmed on 2026-07-31:

1. A valid, active, unused global redeem code fails with the generic frontend fallback.
2. A payment created from the billing page remains in `checkout_created` until the page is manually refreshed, even after the payment has settled.

Read-only staging diagnostics confirmed migration `000051_global_redeem_code_scope.sql` is applied and the reported redeem code is active, unused, and unexpired. The deployed `billing_wallet_ledger_entry_type_check` constraint does not allow `redeem`, while `app.wallet_redeem_code` passes `redeem` into `app.wallet_credit`. PostgreSQL therefore rejects the ledger insert and the API maps the unknown constraint error to `REDEEM_FAILED`.

The payment page reads `paymentId` from `window.location.search` once with `useMemo`. Checkout creation later writes the new ID through `history.replaceState`, which does not rerender the component or emit `popstate`. The payment polling effect therefore never starts until a full page reload reads the query parameter again.

## Goals

- Allow valid redeem codes to credit the personal wallet while preserving existing idempotency, single-user redemption, audit, and expiry behavior.
- Start payment polling immediately after checkout creation without requiring navigation or reload.
- When the owned payment becomes `paid`, update the status panel and refresh wallet balance, ledger activity, and recharge plans.
- Keep the existing three-second interval, terminal-state behavior, retry handling, and 20-attempt limit.

## Non-Goals

- No changes to XunhuPay callbacks, provider reconciliation, or payment signing.
- No SSE, WebSocket, or new background queue.
- No changes to recharge plan pricing or redeem-code ownership semantics.
- No broad billing UI redesign.

## Database Design

Add forward-only migration `000052_wallet_redeem_ledger_entry_type.sql`.

The migration replaces `billing_wallet_ledger_entry_type_check` with the same allowed values plus `redeem`. The constraint remains named and enforced. Existing ledger rows remain valid, and no balance or redemption data is rewritten.

The migration is required before the updated API and frontend are started. The worker must be stopped during migration according to the existing deployment runbook.

## Frontend Design

`BillingCenterPage` will own an `activePaymentId` state initialized from the current `paymentId` query parameter.

Checkout creation will:

1. Render the returned `WalletPayment` immediately.
2. Persist its ID in the billing URL with `history.replaceState`.
3. Set `activePaymentId`, triggering the existing polling effect without a reload.

The polling effect will query the owned payment immediately and every three seconds while it remains non-terminal. On `paid`, it will set the payment panel to `paid` and call the existing billing refresh to reload the summary, ledger, usage, and plans. Cleanup will continue to prevent updates after unmount or payment-ID replacement.

## Error Handling

Known redeem-code errors remain mapped to their specific Chinese messages. The database constraint fix prevents valid codes from falling into the generic `REDEEM_FAILED` path. Unexpected database failures remain server-safe and do not expose SQL details to the browser.

Payment polling keeps the current bounded retry behavior. A transient query failure schedules the next attempt; terminal failures stop polling. This fix does not infer payment success from the return URL or provider page.

## Tests

- Add a migration regression test proving the wallet ledger constraint includes `redeem` and retains existing entry types.
- Add a billing-page regression test that creates a checkout from the current page and proves `getPayment` is called with the new payment ID without reloading.
- Prove the new tests fail before production changes and pass afterward.
- Run focused frontend and database tests, relevant API tests, database/API builds, and the root production build.

## Deployment And Acceptance

Deploy with `docker-compose.staging.yml`, stop the worker, and run `node packages/db/dist/cli.js` before restarting services.

Acceptance criteria:

- The reported valid code can be redeemed once and credits 1000 points.
- A second redemption by the same user returns the existing already-redeemed error.
- A newly created payment changes from payment confirmation to paid on the open billing page within the polling/reconciliation window, without manual refresh.
- The wallet balance and payment ledger row appear after the paid state is observed.
