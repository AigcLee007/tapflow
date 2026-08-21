# Lovart-Inspired Recharge Experience Design

## Status

Approved direction: A, purchase-first centered modal.

This design borrows Lovart's strong purchase focus, plan comparison, and recommended-plan emphasis. It does not copy Lovart's subscription model or promotional copy. TapFlow remains a one-time credit purchase product with WeChat as the only payment method.

## Goals

- Make recharge discoverable from the workspace, balance/insufficient-credit prompts, and the billing page.
- Give users one consistent four-plan purchase experience instead of maintaining a second full plan grid inside `/billing`.
- Make the plan value legible at a glance: display name, total credits, bonus credits, price, and validity.
- Keep the payment QR code in a centered payment state inside the modal.
- Preserve the current server-owned plans, checkout, polling, idempotency, and personal-wallet billing behavior.

## Non-goals

- No subscription, auto-renewal, membership tier, or recurring billing behavior.
- No arbitrary recharge amount.
- No additional payment provider in this change; the UI explicitly identifies WeChat Pay only.
- No changes to plan price, credit quantity, validity, payment callback, refund, or wallet ledger semantics.
- No change to the separate `13.6` reserved-credit issue.

## Product Structure

### `/billing`: wallet and history center

The billing page remains the authoritative place for:

- available, reserved, expiring, and nearest-expiry credit summaries;
- a prominent `充值积分` entry card/button that opens the global recharge modal;
- the redeem-code control directly below the recharge entry;
- usage and wallet ledger activity.

The billing page no longer renders the complete plan card grid. This prevents the modal and page from diverging in copy, recommended state, hover behavior, or payment entry behavior.

### Global recharge entry points

The existing recharge request/context path remains the shared entry mechanism. Workspace balance controls, insufficient-credit prompts, and the `/billing` recharge entry all call the same `openRecharge` action and render the same modal.

The modal opens without navigating away from the current workspace. A user can close it with the close button, Escape, or an outside click when no checkout mutation is in progress.

## Purchase Modal

The modal is a large, centered layer with a dimmed workspace background. It is capped to the viewport height and uses an internal scroll region on smaller screens.

Header content:

- title: `充值积分`;
- current available balance, for context only;
- a visible WeChat badge: `微信支付`;
- close icon button with an accessible label.

Plan content:

- four server-returned plans sorted by `sortOrder`;
- desktop: four equal-width cards in one row;
- compact desktop/tablet: two columns when four cards cannot remain readable;
- mobile: two columns where the card remains usable, otherwise one column;
- fixed card dimensions and aligned CTA rows so hover/content changes do not shift neighboring cards;
- no per-credit unit-price line and no recurring-payment copy.

Display aliases are presentation-only and keyed by stable plan keys:

| Plan key | Display name | Price | Total credits | Base credits | Bonus credits |
| --- | --- | ---: | ---: | ---: | ---: |
| `credits_100` | 轻量尝鲜 | ￥9.90 | 100 | 100 | 0 |
| `credits_700` | 日常创作 | ￥50.00 | 700 | 500 | 200 |
| `credits_1500` | 高频创作 | ￥100.00 | 1,500 | 1,000 | 500 |
| `credits_3300` | 专业创作 | ￥200.00 | 3,300 | 2,000 | 1,300 |

The bonus calculation is derived from the approved baseline of 10 CNY for 100 base credits. The first plan remains the 100-credit entry point even though its commercial price is ￥9.90. The UI must derive the numbers from the server plan amount/credits, with the first-plan exception represented in one tested display helper rather than duplicated in JSX.

Recommended state:

- default recommendation is the second sorted plan (`日常创作`) when at least two plans exist;
- the recommendation uses a clear top ribbon `最受欢迎`, lime accent border, and slightly elevated card;
- hovering a different card temporarily moves the lime background/elevation to the hovered card so the pointer target is obvious;
- the `最受欢迎` ribbon remains attached to the recommended plan and is not silently relabeled;
- keyboard focus receives the same visible emphasis as pointer hover;
- reduced-motion users receive the same state change without transform animation.

Each card contains, in this order:

1. display name;
2. total credits;
3. `加赠 N 积分` when bonus credits are positive;
4. price;
5. `有效期 365 天` (using the server validity value);
6. a short usage-oriented description;
7. `立即充值`.

## Payment State

Selecting a plan creates the existing server-side checkout. On success, the same modal transitions from the plan grid to the centered payment state.

The payment state must show:

- `微信扫码支付`;
- `当前仅支持微信支付`;
- amount, credit quantity, and current payment status;
- QR code centered in the modal when the server returns `qrCodeUrl`;
- a clear waiting/confirmation state while payment is being polled;
- paid success with the credited amount and actions to continue creating or view the billing page;
- terminal failure with retry and return-to-plans actions.

The QR code must never be appended below the billing page. Payment polling remains bounded and authenticated through the existing payment API. The browser return URL is not treated as proof of payment.

QR expiration behavior must use a server-provided payment expiry field if the API exposes one. The existing credit-grant `expiresAtSnapshot` must not be presented as QR validity. If no QR expiry is available, the UI should say that the QR code is valid for the provider checkout window and rely on the existing terminal payment status rather than inventing a duration.

## Error and Loading States

- Plan loading shows four equal skeleton cards in the same grid geometry.
- Plan load failure stays inside the modal and offers `重新加载套餐`.
- Checkout creation failure keeps the modal open, preserves the selected-plan context, and offers retry without duplicating an order (the existing idempotency key behavior remains authoritative).
- Missing QR URL on desktop shows a clear provider-opening/payment-waiting message rather than an empty image.
- A paid response refreshes the wallet summary and billing activity before the success state offers navigation.
- Closing the modal while a checkout request is running is disabled; Escape/outside-click cleanup must not cancel a server request.

## Component Boundaries

- `RechargeContext`: owns the shared open/close state, plan loading, checkout start, payment state, and payment polling.
- `RechargeDialog`: owns the portal, focus/scroll lock, modal shell, and switch between plan and payment states.
- `RechargePanel`: owns plan sorting, display aliases, bonus calculation, recommendation, hover/focus treatment, and plan CTA rendering.
- `PaymentStatusPanel`: owns WeChat-only payment copy, QR presentation, status states, retry/back/continue actions.
- `BillingCenterPage`: owns wallet summaries, the recharge entry, redeem code placement, and activity table; it does not duplicate the plan grid.
- `RedeemCodeBox`: remains below the recharge entry on `/billing` and is not mixed into the purchase modal's plan comparison.

No new payment API or database table is required for this UI restructuring. A backend addition is required only if QR expiry must be displayed as a precise countdown and the provider/API currently does not return that field.

## Accessibility and Responsive Rules

- Modal uses `role="dialog"`, `aria-modal="true"`, and a labelled title.
- Close, retry, back, and CTA controls have accessible names and visible focus states.
- Cards do not rely on hover alone; focused/selected states are equivalent.
- The four cards keep readable text at 320px mobile width, with no clipped price or CTA labels.
- Animations respect `prefers-reduced-motion`.
- WeChat is communicated with text and an icon/badge, not color alone.

## Validation

Focused tests must cover:

- plan alias mapping and four-plan sorting;
- base/bonus calculation for all four approved plans;
- recommendation and hover/focus state semantics;
- `/billing` rendering a single recharge entry plus redeem code below it, with no duplicate plan grid;
- global entry opening the same modal;
- WeChat-only payment copy and centered QR state;
- payment success refresh, terminal failure, bounded polling, and retry/back behavior;
- responsive card geometry and reduced-motion classes where existing test tooling permits.

Run `npm run build` and the focused billing/component suites before implementation is considered complete. Existing unrelated integration failures must be reported separately.

## Acceptance Criteria

1. A user can reach the same large centered recharge modal from workspace/balance prompts and `/billing`.
2. Desktop shows four plans on one row with stable card sizing.
3. `日常创作` is visibly recommended by default, and hover/focus makes the active pointer/keyboard target obvious.
4. The modal clearly states WeChat-only payment and shows the QR code centered in the payment state.
5. `/billing` contains no second full plan grid; redeem code is directly below the recharge entry.
6. Payment success refreshes balance and activity through the existing authenticated APIs.
7. No subscription or automatic-renewal language is introduced.
