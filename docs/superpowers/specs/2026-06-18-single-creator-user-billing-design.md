# Single-Creator Account, Admin, and Expiring Credits Design

Date: 2026-06-18
Status: Approved direction, pending implementation plan

## Product Direction

TapFlow should behave as a single-creator SaaS product. The backend may continue to use tenants as isolation boundaries, but normal users should not see or manage tenant IDs, workspace IDs, role keys, or permission lists.

Product language:

- account
- personal creative space
- credits
- membership tier
- plan
- admin operations

Do not expose the internal tenant model in normal login, account, billing, or creator workflows.

## User-Facing Authentication

Login uses only:

- email
- password

The optional tenant ID login input should be removed from the UI. The login API may keep accepting `tenantId` for compatibility, but the normal frontend must not ask creators to type it.

When a user logs in without a tenant ID, the server should select the default active personal space. The current implementation already falls back to the first active membership; implementation may keep that behavior initially, then add an explicit default marker later if needed.

Registration uses:

- display name
- email
- password

Registration should automatically create the user's personal creative space. The UI should not ask the user to understand tenants or workspace IDs.

## Account Page

The account page should be rebuilt as a creator-facing account center.

Show:

- email
- display name
- account status
- membership tier
- current generation discount
- available credits
- reserved credits
- expiring-soon credits
- lifetime credits
- links to billing and administrator-only tools when allowed

Hide from normal users:

- user ID
- tenant ID
- tenant slug
- role key
- raw permission list

Admin-only diagnostic details may exist in the admin backend, not on the creator-facing account page.

## Platform Admin

The existing `/admin` route is admin-permission gated, but its user search is tenant-scoped. It should become a platform admin surface for configured `ADMIN_EMAILS` users with `admin:system`.

Admin user management should support:

- global user search by email or display name
- user detail view
- account status view
- personal space ID and internal IDs for diagnostics
- current membership tier
- tier override management
- credit batch list
- credit grant with validity selection
- password reset
- enable or disable user account
- recent workflow failure inspection

Admin APIs may cross tenant boundaries only behind `admin:system`. Normal v2 product APIs must remain tenant-scoped.

Every admin mutation must write an audit log with:

- actor user ID
- target user ID
- target tenant ID
- operation
- before/after values when relevant
- request ID and trace ID

## Membership Tiers

Membership tiers:

| Tier | Label | Discount multiplier |
| --- | --- | --- |
| `standard` | Standard user | `1.00` |
| `silver` | Silver member | `0.95` |
| `gold` | Gold member | `0.90` |
| `platinum` | Platinum member | `0.80` |

Recommended data model:

- Store the effective tier on the personal-space billing/account side, because billing is currently tenant-scoped.
- Add fields either to `tenants`, `billing_accounts`, or a dedicated tenant profile table.
- Recommended first implementation: add billing-account-level membership fields to keep pricing and billing reads close together:
  - `membership_tier`
  - `membership_tier_source`
  - `membership_tier_overridden_by`
  - `membership_tier_overridden_at`
  - `membership_tier_expires_at`

Tier source values:

- `plan`
- `admin_override`
- `migration`
- `manual`

Plan assignment should set a default tier. Admins may override it. Effective tier priority:

1. Active admin override
2. Active plan tier
3. `standard`

## Discounted Generation Pricing

Model and route pricing remain configured at original list price in `model_pricing`.

At task creation:

1. Resolve the original route price.
2. Resolve the user's effective membership tier.
3. Apply the tier discount multiplier.
4. Reserve the discounted amount.
5. Persist both original and discounted values in metadata.

Example:

- original route price: `10`
- user tier: `gold`
- multiplier: `0.90`
- reserved amount: `9`

Store metadata in `usage_events`, `billing_ledger`, node `cost_json`, and workbench generation records where relevant:

- `originalCredits`
- `discountedCredits`
- `membershipTier`
- `discountMultiplier`
- `discountCredits`
- `pricingUnit`
- `pricingMatch`

The existing numeric credit precision should be preserved. Amounts should be stored as numeric values with the existing decimal support.

If pricing is missing, generation must still fail closed with `PRICING_NOT_FOUND`; discounts must not create free execution.

## Expiring Credit Batches

Credits expire by acquisition batch. A user may hold multiple credit batches with different expiration dates.

Recommended table: `billing_credit_grants`

Fields:

- `id`
- `tenant_id`
- `billing_account_id`
- `source_type`
- `source_id`
- `original_credits`
- `remaining_credits`
- `reserved_credits`
- `expires_at`
- `status`
- `metadata`
- `created_by`
- `created_at`
- `updated_at`

Source types:

- `plan`
- `payment`
- `redeem`
- `admin_grant`
- `migration`

Status values:

- `active`
- `exhausted`
- `expired`
- `revoked`

Lifetime credits use `expires_at = null`.

Existing aggregate fields on `billing_accounts` may stay as summary/cache fields, but available balance should be derived from active, unexpired credit grants once the batch system is in place.

## Credit Validity Rules

Credit validity is determined by the source package or admin grant selection:

- 1 month: `granted_at + interval '1 month'`
- 3 months: `granted_at + interval '3 months'`
- 1 year: `granted_at + interval '1 year'`
- lifetime: `expires_at = null`
- custom: explicit admin-selected timestamp

Future billing plan fields:

- `credit_validity_months`
- `credit_validity_days`
- `credit_validity_mode`

`credit_validity_mode` may be:

- `months`
- `days`
- `lifetime`
- `custom`

## Reserve, Settle, Refund

Reserve must allocate credits from active unexpired batches in this order:

1. Earliest `expires_at`
2. Lifetime credits last
3. Oldest created batch when expiration is tied

SQL order:

```sql
ORDER BY expires_at ASC NULLS LAST, created_at ASC, id ASC
```

Reserve behavior:

- Lock eligible grants.
- Ensure total unexpired available credits cover the requested discounted amount.
- Increment `reserved_credits` on selected grants.
- Create ledger entry with allocation metadata.

Settle behavior:

- Convert reserved credits into consumed credits by decreasing both `remaining_credits` and `reserved_credits` for the reserved allocation.
- Mark grants `exhausted` when `remaining_credits <= 0`.
- Record the usage event and settle ledger entry.

Refund behavior:

- Release reserved credits back to the same grants.
- Decrement `reserved_credits`.
- Keep `remaining_credits` unchanged.
- Record refund ledger entry.

Ledger allocation metadata should include grant IDs and amounts so retries, refunds, and audits can reconstruct the movement.

## Expiration Handling

Expired credits should not be available for new reservations.

Implementation can start with query-time exclusion:

```sql
WHERE status = 'active'
  AND (expires_at IS NULL OR expires_at > now())
```

A later scheduled job can mark expired grants as `expired` and write expiration ledger records. The first implementation does not need a worker job as long as available-balance queries exclude expired grants.

Account and billing UI should show:

- total available credits
- reserved credits
- credits expiring within 30 days
- lifetime credits
- credit batch history

## Existing Balance Migration

Existing `billing_accounts.balance_cents` values should be backfilled into one migration grant per tenant:

- `source_type = 'migration'`
- `original_credits = balance_cents`
- `remaining_credits = balance_cents`
- `reserved_credits = reserved_cents`
- `expires_at = null`
- metadata notes that this came from pre-expiry aggregate balance

This preserves existing user balances as lifetime credits.

## API Impact

Auth:

- Keep backend login `tenantId` optional for compatibility.
- Frontend login no longer sends `tenantId`.

Billing summary:

- Add membership tier and discount.
- Add expiring/lifetime credit summaries.
- Add credit batches list or a dedicated endpoint.

Admin:

- Add platform-scoped user list and detail endpoints.
- Add tier update endpoint.
- Add credit grant endpoint with validity selection.
- Keep existing redeem code behavior, but redeem results should create expiring credit grants according to the code or plan settings.

Workflow and workbench:

- Apply membership discount before reserve.
- Reserve from credit grants.
- Store original/discounted cost metadata.
- Settle/refund against the reserved grant allocations.

## Testing

Required backend tests:

- Login without tenant ID still succeeds for a normal user.
- Admin user search can find users outside the admin's own tenant.
- Normal users cannot access platform admin endpoints.
- Credit grants with different expiration dates are consumed earliest-expiring first.
- Lifetime credits are consumed after expiring credits.
- Expired credits are excluded from available balance.
- Reserve, settle, and refund preserve grant allocations.
- Existing aggregate balance is migrated to lifetime grant.
- Each membership tier applies the expected multiplier.
- Missing pricing still returns `PRICING_NOT_FOUND`.
- Insufficient unexpired credits returns `INSUFFICIENT_CREDITS`.

Required frontend tests:

- Login page no longer renders tenant ID input.
- Account page hides internal IDs and permission lists.
- Account page shows membership tier and discount.
- Billing page shows expiring/lifetime credit summaries.
- Admin user detail can display and update membership tier.
- Admin credit grant form supports 1 month, 3 months, 1 year, lifetime, and custom expiration.

## Rollout

Recommended implementation phases:

1. User-facing account/auth cleanup.
2. Platform admin global user management.
3. Membership tier storage and discounted pricing.
4. Credit grants table and migration.
5. Reserve/settle/refund allocation logic.
6. Billing/admin UI for credit batches and expiration.

This order improves visible product quality early while keeping the billing-system migration isolated and testable.
