# Lovart-Inspired Recharge Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recharge discoverable from every authenticated creation surface and complete a one-time WeChat credit purchase in one centered, purchase-first modal while keeping `/billing` focused on wallet history.

**Architecture:** Add one `RechargeProvider` above authenticated routes. It owns lazy plan loading, checkout creation, bounded payment polling, payment-id recovery, and the single `RechargeDialog`; callers use `openRecharge` or the SSR-safe request event. `/billing` consumes the provider but renders only a recharge entry, redeem code, summaries, and activity. Existing server payment APIs, idempotency, wallet ledger, reserve/settle/refund, and tenant checks remain unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, lucide-react, Vitest, Testing Library, existing v2 billing/payment APIs.

---

## File Map

Create:
- `src/billing/useRechargeCheckout.ts` and `src/billing/useRechargeCheckout.test.tsx`
- `src/billing/RechargeContext.tsx` and `src/billing/RechargeContext.test.tsx`
- `src/billing/RechargeDialog.tsx` and `src/billing/RechargeDialog.test.tsx`
- `src/billing/rechargeRequest.ts` and `src/billing/rechargeRequest.test.ts`

Modify:
- `src/billing/RechargePanel.tsx` and `src/billing/RechargePanel.test.tsx`
- `src/billing/PaymentStatusPanel.tsx` and `src/billing/PaymentStatusPanel.test.tsx`
- `src/billing/BillingCenterPage.tsx` and `src/billing/BillingCenterPage.test.tsx`
- `src/billing/billingApi.ts` only if a dedicated payment-expiry field already exists in the API response; never reuse `expiresAtSnapshot` for QR validity
- `src/app/AppRouter.tsx`, `src/app/WorkspaceShell.tsx`, and their focused tests
- `src/flowCanvas/canvas/FlowTopToolbar.tsx` and focused tests
- `src/flowCanvas/runtime/v2WorkflowRunner.ts` and focused tests
- `src/workbench/WorkbenchComposer.tsx`, `src/workbench/WorkbenchMobileShell.tsx`, `src/workbench/WorkbenchPage.tsx`, and focused tests
- `PROJECT_RECORD.md`

No database migration or payment endpoint is required.

## Task 1: Plan Display Helpers And Active Card Grid

**Files:** Modify `src/billing/RechargePanel.tsx`, `src/billing/RechargePanel.test.tsx`.

- [ ] **Step 1: Add failing assertions for the approved four plans.** Render unsorted plans with keys `credits_100`, `credits_700`, `credits_1500`, and `credits_3300`; assert sort order, display names `轻量尝鲜`, `日常创作`, `高频创作`, `专业创作`, totals `100/700/1,500/3,300 积分`, and bonus labels `加赠 200 积分`, `加赠 500 积分`, `加赠 1,300 积分` only on the last three cards.

- [ ] **Step 2: Assert copy and interaction semantics.** Assert that `约 ￥` and `自动续费` are absent, the second sorted plan has `最受欢迎`, desktop uses `lg:grid-cols-4`, loading renders four skeletons, and mouse enter/focus adds an active highlight class to the hovered/focused card while the ribbon stays on `日常创作`.

- [ ] **Step 3: Run the focused test to verify the current implementation fails.**

  ```bash
  npx vitest --run src/billing/RechargePanel.test.tsx
  ```

- [ ] **Step 4: Implement presentation-only helpers.** Add a stable key-to-name map and one `getBonusBreakdown` helper using the approved baseline (`credits_100` base is `100`; all other base credits are `Math.floor(amountCents / 10)`). Keep unknown server plans readable with their server name. Store `activePlanKey` in component state, apply the lime border/background/elevation to `activePlanKey ?? recommendedPlanKey`, and attach `onMouseEnter`, `onFocus`, `onMouseLeave`, and `onBlur` to each card. Keep fixed card height and bottom-aligned CTA. Do not add unit-price or recurring copy.

- [ ] **Step 5: Re-run the focused test and commit.**

  ```bash
  npx vitest --run src/billing/RechargePanel.test.tsx
  git add src/billing/RechargePanel.tsx src/billing/RechargePanel.test.tsx
  git commit -m "feat: refine recharge plan cards for Lovart layout"
  ```

## Task 2: Shared Checkout State And Payment Request Bridge

**Files:** Create `src/billing/useRechargeCheckout.ts`, `src/billing/useRechargeCheckout.test.tsx`, `src/billing/rechargeRequest.ts`, `src/billing/rechargeRequest.test.ts`; modify `src/billing/billingApi.ts` only for an already-supported dedicated payment expiry field.

- [ ] **Step 1: Write failing hook tests.** Cover lazy `listRechargePlans`, checkout idempotency prefix `payment-ui:`, Chinese loading/checkout errors, initial `paymentId` recovery, three-second polling, paid invalidation exactly once, terminal-state stop, 120-attempt bound, and visibility-triggered recheck. Assert that `expiresAtSnapshot` is never rendered as QR expiry.

- [ ] **Step 2: Write the event bridge test.** Define `RECHARGE_REQUEST_EVENT = "v2-recharge-request"`, `RechargeRequestDetail` with `source: "canvas" | "shell" | "workbench" | "billing" | "account"`, and assert `requestRecharge(detail)` emits one exact `CustomEvent` and is a no-op when `window` is unavailable.

- [ ] **Step 3: Implement the hook.** Keep `MAX_PAYMENT_POLLS = 120` and `PAYMENT_POLL_INTERVAL_MS = 3000`. Cancel timers and stale writes on cleanup; use `crypto.randomUUID()` for checkout idempotency; call `invalidateBillingSummary()` once per paid payment id; do not write payment state to localStorage or IndexedDB. On mobile, follow the existing `checkoutUrl` only after checkout creation; desktop remains in the modal.

- [ ] **Step 4: Run hook and bridge tests, then commit.**

  ```bash
  npx vitest --run src/billing/useRechargeCheckout.test.tsx src/billing/rechargeRequest.test.ts
  git add src/billing/useRechargeCheckout.ts src/billing/useRechargeCheckout.test.tsx src/billing/rechargeRequest.ts src/billing/rechargeRequest.test.ts src/billing/billingApi.ts
  git commit -m "feat: centralize recharge checkout state"
  ```

## Task 3: Global Recharge Provider And Centered Dialog

**Files:** Create `src/billing/RechargeContext.tsx`, `src/billing/RechargeContext.test.tsx`, `src/billing/RechargeDialog.tsx`, `src/billing/RechargeDialog.test.tsx`; modify `src/app/AppRouter.tsx` and its tests.

- [ ] **Step 1: Add failing provider/dialog tests.** Assert one provider renders one portal, `openRecharge` lazy-loads plans, close button is labelled `关闭充值`, Escape/backdrop close when checkout is idle, close is blocked during checkout, `paymentId` opens the payment state, and success actions either close without navigation or navigate to `/billing`.

- [ ] **Step 2: Implement `RechargeContext`.** Expose `dialogOpen`, `plans`, `plansStatus`, `busyPlanKey`, `payment`, `error`, `openRecharge`, `closeRecharge`, `beginCheckout`, `loadPlans`, and `resetPayment`. Listen for `RECHARGE_REQUEST_EVENT`; show an insufficient-credit prompt with available/required credits and a button that opens the same dialog without creating an order. Provide a safe no-op hook value for routes rendered outside the provider.

- [ ] **Step 3: Implement the modal shell.** Use `createPortal`, `role="dialog"`, `aria-modal="true"`, an `aria-labelledby` title, focus on the close button, body scroll lock, Escape handling, backdrop dismissal, `max-w-[1120px]`, `max-h-[calc(100dvh-32px)]`, and an internal scroll region. Render the plan grid before checkout and the payment panel after checkout. Include a visible `微信支付` badge in the modal/payment header.

- [ ] **Step 4: Mount the provider once.** Wrap the authenticated branches in `AppRouter` with `RechargeProvider`; keep login, register, legal, and other anonymous routes outside it. Do not mount a second provider in a child page.

- [ ] **Step 5: Run the focused tests and commit.**

  ```bash
  npx vitest --run src/billing/rechargeRequest.test.ts src/billing/RechargeContext.test.tsx src/billing/RechargeDialog.test.tsx src/app/AppRouter.test.tsx
  git add src/billing/RechargeContext.tsx src/billing/RechargeContext.test.tsx src/billing/RechargeDialog.tsx src/billing/RechargeDialog.test.tsx src/billing/rechargeRequest.ts src/app/AppRouter.tsx
  git commit -m "feat: add global recharge dialog"
  ```

## Task 4: WeChat-Only Centered Payment State

**Files:** Modify `src/billing/PaymentStatusPanel.tsx`, `src/billing/PaymentStatusPanel.test.tsx`.

- [ ] **Step 1: Add failing payment-state assertions.** Assert `微信扫码支付`, `当前仅支持微信支付`, amount, credits, status, centered QR markup when `qrCodeUrl` exists, paid success actions, and retry/back actions for terminal failures. Assert the component does not mention subscriptions, automatic renewal, or a fabricated countdown.

- [ ] **Step 2: Implement the panel.** Use a centered `max-w-[520px]` layout. Show the QR image with `mx-auto`, a fixed square dimension, white background, and no rendering below the billing page. Show a provider-opening message when QR is absent. Treat `expiresAtSnapshot` as credit validity only; show a precise QR countdown only if a separate server field is present. Keep `refund_pending` informational and preserve the existing payment statuses.

- [ ] **Step 3: Verify and commit.**

  ```bash
  npx vitest --run src/billing/PaymentStatusPanel.test.tsx
  git add src/billing/PaymentStatusPanel.tsx src/billing/PaymentStatusPanel.test.tsx
  git commit -m "feat: center WeChat payment state"
  ```

## Task 5: Wallet-Centered Billing Page

**Files:** Modify `src/billing/BillingCenterPage.tsx`, `src/billing/BillingCenterPage.test.tsx`, and any focused billing styles.

- [ ] **Step 1: Change tests first.** Mount `BillingCenterPage` under `RechargeProvider` and assert wallet summaries render, one `billing-recharge-entry` is present, `RedeemCodeBox` appears immediately after it, activity follows, and `recharge-plan-grid` is absent until the modal opens. Assert the recharge entry opens the global modal and that existing ledger/usage loading errors remain Chinese and do not expose server messages.

- [ ] **Step 2: Remove page-owned plan/payment state.** Delete local `plans`, `payment`, `activePaymentId`, polling, `getPayment`, `createPaymentCheckout`, and `listRechargePlans` usage from `BillingCenterPage`. Keep summary, ledger, usage, catalog, and activity refresh. Render a prominent `充值积分` entry card/button that calls `recharge.openRecharge({ source: "billing" })`; put `RedeemCodeBox` directly below that entry. Do not render `RechargePanel` on the page.

- [ ] **Step 3: Verify the billing flow and commit.**

  ```bash
  npx vitest --run src/billing/BillingCenterPage.test.tsx src/billing/RedeemCodeBox.test.tsx src/billing/useBillingSummarySnapshot.test.tsx
  git add src/billing/BillingCenterPage.tsx src/billing/BillingCenterPage.test.tsx
  git commit -m "feat: keep billing page focused on wallet history"
  ```

## Task 6: Expose One Recharge Entry Across Creator Surfaces

**Files:** Modify `src/app/WorkspaceShell.tsx`, `src/flowCanvas/canvas/FlowTopToolbar.tsx`, `src/flowCanvas/runtime/v2WorkflowRunner.ts`, `src/workbench/WorkbenchComposer.tsx`, `src/workbench/WorkbenchMobileShell.tsx`, `src/workbench/WorkbenchPage.tsx`, and focused tests.

- [ ] **Step 1: Add shell, toolbar, and workbench tests.** Assert shell navigation still reaches `/billing`, account balance card contains `立即充值`, canvas toolbar exposes a `充值积分` action, and desktop/mobile workbench actions open the same modal without navigating or clearing a draft.

- [ ] **Step 2: Wire the shared action.** Consume `useRecharge()` in `WorkspaceShell`, toolbar, and workbench components. Keep existing menu density tokens. Use `openRecharge({ source })` for `shell`, `canvas`, and `workbench`; do not create another checkout hook or duplicate a plan grid.

- [ ] **Step 3: Add insufficient-credit event coverage.** In `v2WorkflowRunner`, immediately before the existing fail-closed insufficient-credit throw, dispatch `requestRecharge({ availableCredits, requiredCredits, source: "canvas" })`. Keep pricing failure, reserve ordering, enqueue behavior, error codes, and server billing semantics unchanged. In workbench, guard the generate action with its existing estimate; when balance is insufficient, open the modal and leave the draft intact.

- [ ] **Step 4: Run focused creator-surface tests and commit.**

  ```bash
  npx vitest --run src/app/WorkspaceShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/workbench/WorkbenchPage.test.tsx
  git add src/app/WorkspaceShell.tsx src/flowCanvas/canvas/FlowTopToolbar.tsx src/flowCanvas/runtime/v2WorkflowRunner.ts src/workbench/WorkbenchComposer.tsx src/workbench/WorkbenchMobileShell.tsx src/workbench/WorkbenchPage.tsx
  git commit -m "feat: expose recharge from creator surfaces"
  ```

## Task 7: Verification And Project Record

**Files:** Modify `PROJECT_RECORD.md`.

- [ ] **Step 1: Run the complete focused suite.**

  ```bash
  npx vitest --run src/billing/RechargePanel.test.tsx src/billing/useRechargeCheckout.test.tsx src/billing/rechargeRequest.test.ts src/billing/RechargeContext.test.tsx src/billing/RechargeDialog.test.tsx src/billing/PaymentStatusPanel.test.tsx src/billing/BillingCenterPage.test.tsx src/app/AppRouter.test.tsx src/app/WorkspaceShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/workbench/WorkbenchPage.test.tsx
  ```

- [ ] **Step 2: Run build and whitespace checks.**

  ```bash
  npm run build
  git diff --check
  ```

  Record exact failures if local infrastructure or an unrelated historical suite blocks execution; do not claim success without command output.

- [ ] **Step 3: Perform browser acceptance at desktop and mobile sizes.** Verify four cards remain one row on desktop, hover/focus highlight follows the active card, `/billing` has no plan grid, redeem code follows the recharge entry, modal QR is centered, and payment success refreshes wallet data. Verify 320-390px layouts and reduced-motion behavior.

- [ ] **Step 4: Update `PROJECT_RECORD.md`** with the date, changed user flow, focused tests, build result, browser result, and the explicit non-goals: no subscription semantics, no payment API/database change, and no QR countdown without a dedicated expiry field.

- [ ] **Step 5: Commit the project record.**

  ```bash
  git add PROJECT_RECORD.md
  git commit -m "docs: record Lovart recharge experience"
  ```

## Acceptance Criteria

1. Workspace, canvas, workbench, account balance, and `/billing` all open the same centered recharge modal.
2. The modal shows four server plans in one desktop row with approved aliases, totals, bonuses, and `日常创作` as the recommended plan.
3. Pointer hover and keyboard focus visibly move the active card highlight without changing the recommendation ribbon.
4. Payment state explicitly says WeChat-only and keeps the QR centered in the modal.
5. `/billing` contains wallet summaries, one recharge entry, redeem code directly below it, and activity; it does not contain a second plan grid.
6. Paid status invalidates and refreshes the wallet summary; polling is bounded and authenticated.
7. No subscription, auto-renewal, unit-price, secret, local authoritative payment state, database migration, or payment endpoint change is introduced.
