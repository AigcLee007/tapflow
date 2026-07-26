# XunhuPay Personal Wallet Design

Date: 2026-07-27
Status: Approved design
Scope: Personal AI-credit wallet, fixed recharge plans, XunhuPay checkout and callback processing, credit expiration, refund administration, and migration from tenant wallets

## 1. Summary

TapFlow will replace tenant-owned spendable AI-credit balances with one global personal wallet per user. A user's wallet follows the user across every workspace. Workflow usage remains attributed to the workspace, project, workflow run, and node run where it occurred, but reserve, settle, refund, and expiration operate against the initiating user's wallet.

XunhuPay is the first real payment provider. The API creates XunhuPay checkout orders server-side, validates signed asynchronous notifications, and grants credits exactly once. The frontend never receives the merchant secret and cannot choose the charged amount, credit quantity, validity period, or credited user.

The first release uses four platform-managed fixed recharge plans:

| Plan key | Price | Credits | Initial validity |
| --- | ---: | ---: | ---: |
| `credits_100` | CNY 9.90 | 100 | 365 days |
| `credits_700` | CNY 50.00 | 700 | 365 days |
| `credits_1500` | CNY 100.00 | 1,500 | 365 days |
| `credits_3300` | CNY 200.00 | 3,300 | 365 days |

Only platform system administrators may edit plan price, credit quantity, validity days, display order, or active status. A plan change affects new payment orders only. Every order stores a complete commercial snapshot.

## 2. Confirmed Product Decisions

- A wallet belongs to `user_id`, not `tenant_id`.
- One user has exactly one global wallet across all workspaces.
- Every authenticated user may recharge their own wallet.
- Users cannot recharge another user or a workspace.
- AI usage is charged to the user who initiates the run.
- Usage retains `tenant_id` for workspace attribution and auditing.
- Recharge credits expire. The initial validity is 365 days from successful payment.
- Platform system administrators manage recharge plans and validity periods.
- A plan update never changes an existing payment or credit grant.
- Credits are consumed from the earliest-expiring eligible grant first.
- The first release has no user self-service refunds.
- Platform administrators may issue a full refund only while the payment's grant is completely unused and unreserved.
- Existing tenant balance is migrated to the tenant owner's personal wallet. Old tenant billing records remain immutable and read-only.
- Existing workspace membership discounts are not redesigned in this project. The current workspace discount is applied when pricing the run, and the discounted amount is then charged to the personal wallet.

## 3. Approaches Considered

### 3.1 New personal-wallet ledger with a controlled cutover (selected)

Create a new user-owned wallet, grants, reservations, ledger, and payments domain. Retain old tenant billing tables for historical audit. Add personal-wallet ownership to the workflow billing path while leaving `usage_events` tenant-attributed.

This gives the cleanest ownership model, makes migration and rollback auditable, and avoids rewriting historical tenant rows into a meaning they never had.

### 3.2 Rewrite the existing tenant billing tables in place

Changing current `tenant_id` keys to `user_id` would reduce the number of new tables, but it would simultaneously alter RLS, historical records, membership data, payment records, reserve allocations, and admin reporting. It creates an unnecessarily risky cutover and weakens historical auditability.

### 3.3 Keep both tenant and personal wallets indefinitely

A permanent dual-wallet model would require payment destination choices, debit precedence, mixed refunds, transfers, and complex UI explanations. The approved product explicitly removes workspace recharge, so this complexity has no current value.

## 4. Domain Model

### 4.1 `billing_wallets`

One current aggregate balance per user:

- `id uuid primary key`
- `user_id uuid not null unique references users(id)`
- `balance_credits numeric(18,4) not null default 0`
- `reserved_credits numeric(18,4) not null default 0`
- `status text not null default 'active'`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

The table intentionally has no `tenant_id`: wallet ownership is global and personal. This is a documented exception to the normal tenant-table rule.

### 4.2 `billing_wallet_credit_grants`

Tracks expiring credit batches and their source:

- `id`
- `wallet_id`
- `user_id`
- `source_type`: `payment`, `redeem`, `admin_grant`, or `migration`
- `source_id`
- `original_credits`
- `remaining_credits`
- `reserved_credits`
- `expires_at`
- `status`: `active`, `exhausted`, `expired`, or `revoked`
- `metadata`
- `created_at`
- `updated_at`

An index orders active grants by `expires_at ASC NULLS LAST, created_at ASC` for deterministic earliest-expiry-first allocation.

### 4.3 `billing_wallet_ledger`

Immutable personal-wallet ledger:

- `id`
- `wallet_id`
- `user_id`
- nullable `tenant_id`, `workflow_run_id`, `node_run_id`, and `usage_event_id` for usage attribution
- `entry_type`: including `payment`, `migration_credit`, `admin_credit`, `reserve`, `settle`, `refund`, `expire`, and `payment_refund`
- signed `amount_credits`
- `idempotency_key`
- `description`
- `metadata`
- `created_at`

`UNIQUE (user_id, idempotency_key)` prevents duplicate personal-wallet mutations.

### 4.4 `billing_wallet_credit_reservations`

Records the exact grant allocation for each reserve operation:

- `wallet_ledger_id`
- `credit_grant_id`
- `usage_event_id`
- `amount_credits`
- `status`: `reserved`, `settled`, or `refunded`
- usage attribution and timestamps

This permits a failure refund to return credits to the original grant instead of extending or changing its expiry.

### 4.5 `billing_recharge_plans`

Platform-global commercial catalog:

- stable `key`
- display `name`
- `amount_cents`
- `credits`
- `validity_days`
- `active`
- `sort_order`
- `metadata`
- `updated_by`
- timestamps

The table intentionally has no `tenant_id` because it is a platform-global catalog. It is readable by authenticated users and writable only through system-admin APIs.

### 4.6 `billing_wallet_payments`

Personal payment order and commercial snapshot:

- `wallet_id` and `user_id`
- `plan_id` and stable `plan_key`
- `merchant_order_id` with a provider-safe unique value of at most 32 characters
- `provider = 'xunhupay'`
- `provider_transaction_id`
- `provider_open_order_id`
- `amount_cents`
- `credits`
- `plan_name_snapshot`
- `validity_days_snapshot`
- `expires_at_snapshot`, calculated from the successful-payment time
- `status`
- `billing_ledger_id`
- `idempotency_key`
- `failure_code`
- `paid_at`
- `metadata`
- timestamps

The payment idempotency key and merchant order ID remain separate: the first deduplicates client intent, while the second identifies the order to XunhuPay and its callback.

### 4.7 Existing `usage_events`

`usage_events` remains tenant-scoped because usage happens inside a workspace. It gains `billed_user_id` and links to the personal reserve/settlement records. Tenant admins can still audit workspace consumption, while users can view their own wallet ledger across workspaces.

## 5. RLS and Authorization

- Personal-wallet tables use `user_id = app.current_user_id()` for ordinary user reads.
- Ordinary user APIs derive the wallet owner from the authenticated request and never accept a client-supplied owner.
- System-admin cross-user reads and mutations use explicit system-admin policies based on `app.current_is_system_admin()` and existing admin authorization.
- New permissions for plan management, payment operations, and refunds are assigned only to the system-admin role. Tenant roles do not receive them.
- Platform plan reads expose commercial fields only. Audit metadata and administrator identities remain admin-only.
- The XunhuPay callback is public HTTP but not public database access. The API verifies the provider signature before invoking a narrowly scoped, idempotent database callback operation.
- Callback order resolution does not trust `attach` or a client-provided user ID. A server-only, fixed-`search_path` `SECURITY DEFINER` database function resolves the unique merchant order, locks it, validates amount and state, and performs the applicable payment or refund transition atomically. Only an `OD` transition may create the payment ledger entry and credit grant. Execute permission is limited to the API database role.
- No payment secret, raw credential, or full signed request is stored in frontend-visible data.

## 6. User APIs

Existing endpoints retain their paths but return the authenticated user's wallet data:

```text
GET  /api/v2/billing/summary
GET  /api/v2/billing/usage-events
GET  /api/v2/billing/ledger
GET  /api/v2/billing/recharge-plans
POST /api/v2/billing/payment/create-checkout
GET  /api/v2/billing/payments/:paymentId
POST /api/v2/billing/payment/xunhu/notify
```

`create-checkout` accepts only `planKey` and `idempotencyKey`. The server resolves price, credits, validity, user, and wallet. It rejects inactive or missing plans before creating a provider order.

`GET /payments/:paymentId` requires the payment's `user_id` to equal the authenticated user. A browser return URL is never proof of payment.

## 7. Platform Admin APIs

```text
GET    /api/v2/admin/billing/recharge-plans
POST   /api/v2/admin/billing/recharge-plans
PATCH  /api/v2/admin/billing/recharge-plans/:planId
GET    /api/v2/admin/billing/payments
POST   /api/v2/admin/billing/payments/:paymentId/query
POST   /api/v2/admin/billing/payments/:paymentId/refund
```

Every admin mutation records an audit log with actor, target, before/after commercial values, request ID, and reason where applicable.

## 8. XunhuPay Integration

### 8.1 Configuration

API-only environment variables:

```text
PAYMENTS_ENABLED=false
XUNHU_APP_ID=<merchant-app-id>
XUNHU_APP_SECRET=<merchant-app-secret>
XUNHU_BASE_URL=https://api.xunhupay.com
XUNHU_NOTIFY_URL=<public-origin>/api/v2/billing/payment/xunhu/notify
XUNHU_RETURN_URL=<public-origin>/billing
XUNHU_TIMEOUT_MS=10000
```

The variables must be listed in `x-tapflow-env` in `docker-compose.staging.yml`. Repository documentation contains templates only and never real merchant credentials.

### 8.2 Checkout request

The API posts JSON to `https://api.xunhupay.com/payment/do.html`, with the base URL configurable for the documented backup endpoint. Required request fields are:

- `version = 1.1`
- `appid`
- unique `trade_order_id`
- `total_fee` in decimal CNY yuan, derived exactly from integer cents
- provider-safe title
- Unix `time`
- `notify_url`
- `return_url`
- random `nonce_str`
- `hash`

The signature implementation removes `hash` and empty values, sorts keys by ASCII order, joins `key=value` pairs with `&`, appends `APPSECRET` with no delimiter, and calculates a lowercase MD5 digest. Response signatures are verified using a constant-time comparison.

The checkout response returns mobile `url` and desktop `url_qrcode`. The frontend redirects mobile users to `url` and displays `url_qrcode` on desktop; it does not show the QR code and then redirect to the mobile URL.

### 8.3 Callback

XunhuPay sends an `application/x-www-form-urlencoded` POST. The API registers a bounded form parser without introducing an unrelated dependency. It verifies the signature over all non-empty extension fields except `hash`, then verifies:

- configured `appid`
- known `trade_order_id`
- exact amount after strict decimal-to-cents parsing
- recognized provider state; only `OD` can create a credit grant
- permitted local payment state

For `OD`, the idempotent database operation locks the payment row, creates one `payment` ledger row, creates one credit grant, updates the wallet aggregate, attaches provider IDs, and transitions the payment to `paid`. An already-paid callback with identical commercial data returns success without mutation. `CD`, `RD`, and `UD` are accepted only for a compatible paid/refund state and perform the refund-state transitions defined below without creating credits. Conflicting data is rejected and logged.

The API returns the exact plain-text body `success` only after the transaction commits. Any processing failure returns a non-success response so XunhuPay can perform its documented retries.

### 8.4 Reconciliation

A timed reconciliation job queries XunhuPay for payments that remain pending after checkout expiry or have an uncertain create result. It never creates a replacement merchant order automatically. Platform admins can trigger the same signed query operation from the payment detail view.

## 9. Payment State Machine

Internal states:

```text
pending -> checkout_created -> paid
pending|checkout_created -> create_failed|cancelled
paid -> refund_pending -> refunded|refund_failed
```

XunhuPay states map as follows:

- `OD` -> `paid`
- `CD` -> `refunded`
- `RD` -> `refund_pending`
- `UD` -> `refund_failed`

Provider errors and state conflicts retain safe diagnostic codes without storing secrets or full signed payloads.

## 10. Credit Expiration and Allocation

- Successful payment creates a grant whose `expires_at` equals committed payment time plus the order's `validity_days_snapshot`.
- Reserve allocates from active grants in earliest-expiry-first order, locking the wallet and selected grants.
- Settlement consumes the recorded reservation allocation.
- Workflow failure returns credits to the same grants.
- If a reserved grant expires before a later failure refund, the returned amount remains expired and unavailable.
- Balance reads and reserve operations lazily expire overdue grants inside their transaction so expired credits can never be spent.
- A worker sweep records `expire` ledger entries and marks overdue grants expired for timely UI and operational reporting.
- The UI shows available credits, reserved credits, credits expiring soon, and nearest expiry date.

## 11. Workflow Billing

At workflow creation, the authenticated user becomes `billed_user_id` on the workflow run and related usage events. Retries keep that immutable billing owner even if another user later views or resumes the project.

Pricing continues to resolve provider/model/route/unit and the existing current-workspace membership discount. The discounted estimate is reserved from `billed_user_id`'s personal wallet before enqueue. Missing pricing still fails closed with `PRICING_NOT_FOUND`. Insufficient personal balance returns `402 INSUFFICIENT_BALANCE` and creates no free execution.

Worker success settles the personal reservation. Worker failure releases it to the original grant allocations. Existing idempotency principles continue to cover reserve, usage, settle, and refund.

## 12. Refunds

There is no user self-service refund in the first release. A system administrator may request a full refund only when the payment's grant retains all original credits and has no reservation.

The API validates eligibility before calling XunhuPay. On confirmed refund, it revokes the grant, subtracts its available credits, writes an immutable negative `payment_refund` ledger entry, and marks the payment `refunded`. A provider `RD` response leaves the payment pending for reconciliation. `UD` marks the attempt failed without mutating credits.

Partially consumed or reserved grants return `PAYMENT_CREDITS_ALREADY_USED` and require an explicitly documented manual support process. Refund idempotency prevents duplicate provider calls and duplicate wallet deductions.

## 13. Tenant Balance Migration

The migration runs with the worker stopped and requires no active tenant billing reservations. It provides a dry-run report before writes.

For every tenant:

1. Resolve exactly one active tenant owner.
2. If ownership is missing or ambiguous, report the tenant and make no mutation for it.
3. Create or load the owner's personal wallet.
4. Copy each active, unexpired tenant grant's remaining available credits into a distinct `migration` grant.
5. Preserve the source grant's existing `expires_at`; a source grant with no expiry remains non-expiring so the cutover does not retroactively confiscate credit.
6. Write a `migration_credit` ledger entry containing source tenant, account, and grant IDs.
7. Use stable source-derived idempotency keys so rerunning the migration cannot duplicate credit.

If one user owns multiple workspaces, all grants reach the same wallet but remain individually traceable. Old tenant accounts, grants, reservations, and ledger remain unchanged and read-only after cutover. Existing historical usage rows remain unchanged; `usage_events` continues to receive new tenant-attributed usage with `billed_user_id`.

Pre- and post-migration verification compares total migrated available credit, source-by-source mappings, unresolved tenants, and wallet aggregates. The cutover aborts if totals differ or active reservations remain.

## 14. Frontend Experience

The `/billing` experience becomes personal rather than workspace-owned:

- personal available and reserved balance
- expiring-soon total and nearest expiry
- the four active recharge plans returned by the server
- personal payment, usage, expiration, migration, and refund activity

Checkout creates the order once. Desktop displays the provider QR code; mobile redirects to the provider URL. Returning to `/billing?paymentId=...` starts bounded polling of the authenticated payment status. The UI shows `confirming`, `paid`, `failed`, or `expired/cancelled` based only on API state and refreshes summary and ledger after `paid`.

No native select or one-off menu pattern is introduced. Any new menus use the shared TapNow menu components and density tokens.

The platform admin billing surface manages plans and orders. It never displays `APPSECRET`, signatures, encrypted credentials, or full callback bodies.

## 15. Error Handling and Observability

- Invalid signature, app ID, amount, unknown order, and conflicting duplicate callback never grant credit.
- Provider timeout with unknown outcome transitions to reconciliation, not automatic duplicate checkout.
- Callback database failure returns non-success to preserve provider retry behavior.
- Paid-but-not-credited cannot be represented: payment state and credit grant commit atomically.
- Metrics and structured logs cover checkout outcomes, callback signature failure, reconciliation backlog, paid-order latency, duplicate callbacks, grant expiration, and refund failure.
- Logs use internal payment IDs and redacted provider IDs; they exclude secrets and full signed payloads.

## 16. Testing

Unit coverage includes:

- official signing fixtures and constant-time comparison
- strict `9.9 CNY -> 990 cents` conversion
- checkout request/response parsing
- plan snapshots and inactive-plan rejection
- payment state mapping
- earliest-expiry-first grant allocation
- expiry during reservation and failure refund
- refund eligibility

Database and API coverage includes:

- one user consuming one wallet across multiple tenants
- different users unable to read or spend each other's wallets
- current authenticated user fixed as payment owner
- amount, credit, validity, and user tampering ignored or rejected
- duplicate and concurrent callback exactly-once behavior
- bad signature, wrong amount, wrong app ID, unknown order, unsupported state, and incompatible state-transition rejection
- workflow reserve/settle/refund against personal grants
- pricing-not-found and insufficient-balance fail-closed behavior
- full refund, duplicate refund, and partially-used rejection
- lazy and scheduled expiration
- migration dry-run, unresolved owner, preserved expiry, aggregation, and rerun idempotency
- user and system-admin RLS policies

Frontend coverage includes the four plan values, responsive checkout mode, return-state polling, payment success refresh, expiration display, personal activity filtering, and no return-URL trust.

Required validation:

```bash
npm run build
npm run test --workspace @aigc-flow/api
npm run test --workspace @aigc-flow/worker
npm run test --workspace @aigc-flow/db
npm test
```

Staging acceptance uses the lowest real plan to verify checkout, callback, exactly-once crediting, personal cross-workspace spending, expiration snapshot, reconciliation, and an eligible full refund. XunhuPay documentation does not establish a sandbox, so the test must be treated as a real small payment unless the merchant account provides a separate approved test channel.

## 17. Deployment and Cutover

1. Deploy new schema, RLS, APIs, migration tooling, and UI with `PAYMENTS_ENABLED=false`.
2. Build images and stop the worker.
3. Back up PostgreSQL.
4. Run the compiled database migration with `node packages/db/dist/cli.js`.
5. Run tenant-wallet migration in dry-run mode and resolve every reported owner or reservation exception.
6. Run the write migration and verify source-to-wallet totals.
7. Switch API and worker billing ownership to personal wallets.
8. Start Redis, API, worker, and frontend.
9. Validate personal reserve/settle/refund across two workspaces in staging.
10. Configure server-only XunhuPay credentials and public HTTPS callback/return URLs.
11. Complete the smallest real payment and eligible refund acceptance test.
12. Enable `PAYMENTS_ENABLED=true` only after callbacks, reconciliation, wallet ledger, and monitoring are confirmed.

Deployment uses `docker-compose.staging.yml` and `/opt/aittco/env/tapflow.staging.env` in the repository's documented safe order.

If checkout is broken, disable `PAYMENTS_ENABLED` without deleting payment or ledger data. After personal-wallet transactions begin, do not roll back to tenant charging because that would ignore valid personal balances. Prefer a forward fix while checkout and new generation are temporarily disabled. Historical ledger rows remain immutable.

## 18. Non-goals

- Subscription billing or automatic renewals
- User-entered arbitrary recharge amounts
- Workspace-owned or shared wallets
- Wallet-to-wallet or user-to-workspace transfers
- User self-service refunds
- Partial automated refunds
- Redesign of existing workspace membership tiers or discounts
- Additional payment providers in the first release

## 19. Acceptance Criteria

The feature is acceptable when:

- one authenticated user has one personal wallet across every workspace;
- all new AI runs reserve and settle against the initiating user's immutable `billed_user_id`;
- the four approved plans are server-owned and accurately represented in checkout;
- a valid XunhuPay `OD` callback credits the order exactly once;
- invalid or conflicting callbacks never credit a wallet;
- payment grants receive the committed validity snapshot and expire correctly;
- refund and migration operations are idempotent and fully auditable;
- old tenant balances are migrated to owners with totals verified and old records preserved;
- ordinary users cannot read or mutate another user's wallet;
- platform administrators can manage plans, reconcile payments, and issue eligible full refunds without secret exposure;
- all required builds, focused tests, and staging acceptance checks pass.
