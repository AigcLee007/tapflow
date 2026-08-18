# Billing Recharge Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make one-time credit recharge visible from every authenticated creation surface, present fixed server-owned plans as clear product cards, and complete checkout in a reusable global dialog without changing the existing payment API.

**Architecture:** Mount one RechargeProvider above all authenticated routes. It owns lazy plan loading, checkout creation, payment polling, paymentId recovery, and one global dialog. Billing, shell, canvas, and workbench consume the same typed context. A browser event bridge connects non-React canvas preflight to the provider.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, lucide-react, Vitest, Testing Library, existing v2 billing/payment APIs.

---

## File Map

Create:
- src/billing/useRechargeCheckout.ts and useRechargeCheckout.test.tsx
- src/billing/RechargeContext.tsx and RechargeContext.test.tsx
- src/billing/RechargeDialog.tsx and RechargeDialog.test.tsx
- src/billing/rechargeRequest.ts and rechargeRequest.test.ts
- src/workbench/workbenchPricing.ts and workbenchPricing.test.ts

Modify:
- src/billing/RechargePanel.tsx, PaymentStatusPanel.tsx, BillingCenterPage.tsx, BillingSummaryCards.tsx and focused tests
- src/app/AppRouter.tsx, WorkspaceShell.tsx and test
- src/flowCanvas/canvas/FlowTopToolbar.tsx and test
- src/flowCanvas/runtime/v2WorkflowRunner.ts and test
- src/workbench/WorkbenchComposer.tsx, WorkbenchMobileShell.tsx, WorkbenchPage.tsx and test
- PROJECT_RECORD.md

Phase one has no database migration and no payment API change. Keep RechargePanel.tsx and convert it into the shared card grid.

## Task 1: Shared Fixed-Plan Card Grid

**Files:** Modify src/billing/RechargePanel.tsx. Create src/billing/RechargePanel.test.tsx.

- [ ] **Step 1: Write failing tests**

Render three server RechargePlan objects and assert:

~~~tsx
expect(screen.getByRole('heading', { name: '充值积分' })).toBeTruthy();
expect(screen.getByText('一次购买，立即到账，不自动续费')).toBeTruthy();
expect(screen.getByTestId('recharge-plan-grid').className).toContain('lg:grid-cols-3');
expect(screen.getByText('入门创作')).toBeTruthy();
expect(screen.getAllByText('有效期 365 天')).toHaveLength(3);
expect(screen.queryByText(/首充|赠送|自动续费中/)).toBeNull();
~~~

Also assert the second sortOrder plan gets 推荐 and the filled CTA, CTA passes the exact plan to onSelect, loading renders stable skeletons, error offers 重新加载套餐, and empty ready state has no purchase CTA.

- [ ] **Step 2: Verify failure**

~~~bash
npx vitest --run src/billing/RechargePanel.test.tsx
~~~

Expected: FAIL because current RechargePanel owns checkout.

- [ ] **Step 3: Implement**

Use:

~~~ts
type RechargePanelProps = {
  busyPlanKey: string | null;
  onRetry?: () => void;
  onSelect: (plan: RechargePlan) => Promise<void> | void;
  plans: RechargePlan[];
  status: 'idle' | 'loading' | 'ready' | 'error';
};
~~~

Sort by sortOrder. Use the second sorted plan as the stable phase-one recommendation. Render one column on mobile and lg:grid-cols-3 on desktop. Each min-h-[300px] card shows server name, credits, amount, positive-credit unit-price hint, validity, and fixed-bottom 立即充值. Never invent bonus, old price, discount, or subscription data.

- [ ] **Step 4: Verify pass**

~~~bash
npx vitest --run src/billing/RechargePanel.test.tsx
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add src/billing/RechargePanel.tsx src/billing/RechargePanel.test.tsx
git commit -m "feat: add recharge plan card grid"
~~~

## Task 2: Shared Checkout And Polling Hook

**Files:** Create src/billing/useRechargeCheckout.ts and test. Modify src/billing/PaymentStatusPanel.tsx and test.

- [ ] **Step 1: Write failing hook tests**

Test this contract:

~~~ts
export type RechargeCheckoutState = {
  busyPlanKey: string | null;
  error: string | null;
  loadPlans: () => Promise<void>;
  payment: WalletPayment | null;
  plans: RechargePlan[];
  plansStatus: 'idle' | 'loading' | 'ready' | 'error';
  resetPayment: () => void;
  startCheckout: (plan: RechargePlan) => Promise<WalletPayment | null>;
};
~~~

Cover lazy loading, payment-ui idempotency prefix, mobile redirect, 3-second polling, paid callback once, terminal stop, 120-attempt stop, initialPaymentId recovery, visibility recheck, and Chinese errors.

- [ ] **Step 2: Verify failure**

~~~bash
npx vitest --run src/billing/useRechargeCheckout.test.tsx
~~~

Expected: FAIL because hook is absent.

- [ ] **Step 3: Implement hook**

Keep MAX_PAYMENT_POLLS 120 and interval 3000. Cancel timers and stale writes on cleanup. Guard paid callbacks with a Set of payment ids and call invalidateBillingSummary. Do not persist payment/QR/balance to storage.

~~~ts
const next = await createPaymentCheckout({
  planKey: plan.key,
  idempotencyKey: 'payment-ui:' + crypto.randomUUID(),
});
setPayment(next);
if (isMobile() && next.checkoutUrl) window.location.assign(next.checkoutUrl);
return next;
~~~

- [ ] **Step 4: Upgrade PaymentStatusPanel**

Props: payment, onBackToPlans, onContinue, onRetry, onViewBilling. Always show order amount and credits. Pending desktop shows QR. Paid shows 充值成功, credited amount, 继续创作, 查看账单. Failed/cancelled/refunded states show 重新支付 and 返回套餐. refund_pending is informational.

- [ ] **Step 5: Verify**

~~~bash
npx vitest --run src/billing/useRechargeCheckout.test.tsx src/billing/PaymentStatusPanel.test.tsx
~~~

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add src/billing/useRechargeCheckout.ts src/billing/useRechargeCheckout.test.tsx src/billing/PaymentStatusPanel.tsx src/billing/PaymentStatusPanel.test.tsx
git commit -m "refactor: centralize recharge checkout state"
~~~

## Task 3: Global Provider, Dialog, And Runtime Bridge

**Files:** Create RechargeContext, RechargeDialog, rechargeRequest and tests. Modify src/app/AppRouter.tsx.

- [ ] **Step 1: Write and test event bridge**

~~~ts
export const RECHARGE_REQUEST_EVENT = 'v2-recharge-request';

export type RechargeRequestDetail = {
  availableCredits?: number;
  requiredCredits?: number;
  source: 'canvas' | 'shell' | 'workbench' | 'billing' | 'account';
};

export function requestRecharge(detail: RechargeRequestDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RECHARGE_REQUEST_EVENT, { detail }));
}
~~~

Assert one exact event and SSR-safe no-op.

- [ ] **Step 2: Write failing provider/dialog tests**

Cover openRecharge, lazy load, one portal, close icon 关闭充值, Escape/backdrop dismissal unless busy, paymentId recovery, Continue without navigation, View Billing navigation, and insufficient-credit event producing a compact prompt whose 立即充值 button opens the dialog without creating an order.

- [ ] **Step 3: Implement context**

~~~ts
export type RechargeContextValue = RechargeCheckoutState & {
  beginCheckout: (plan: RechargePlan) => Promise<void>;
  closeRecharge: () => void;
  dialogOpen: boolean;
  openRecharge: (options: { source: RechargeRequestDetail['source'] }) => void;
};
~~~

Provider reads paymentId from current search, uses useRechargeCheckout, listens for RECHARGE_REQUEST_EVENT, renders one prompt and one RechargeDialog, and exposes useRecharge. No localStorage/IndexedDB.

- [ ] **Step 4: Implement accessible dialog**

Use createPortal, role dialog, aria-modal true, labelled title, z-[2600], initial close focus, Escape/backdrop close, body scroll lock cleanup, max width 1120px, max height from 100dvh, and internal scrolling. Render RechargePanel before payment and PaymentStatusPanel after checkout.

- [ ] **Step 5: Mount provider**

Inside AuthGate, wrap project canvas, fullscreen workbench, and WorkspaceShell branches with RechargeProvider. Do not mount for auth/legal routes.

- [ ] **Step 6: Verify**

~~~bash
npx vitest --run src/billing/rechargeRequest.test.ts src/billing/RechargeContext.test.tsx src/billing/RechargeDialog.test.tsx src/app/AppRouter.test.tsx
~~~

Expected: PASS.

- [ ] **Step 7: Commit**

~~~bash
git add src/billing/RechargeContext.tsx src/billing/RechargeContext.test.tsx src/billing/RechargeDialog.tsx src/billing/RechargeDialog.test.tsx src/billing/rechargeRequest.ts src/billing/rechargeRequest.test.ts src/app/AppRouter.tsx
git commit -m "feat: add global recharge dialog"
~~~

## Task 4: Recharge-First Billing Page

**Files:** Modify BillingCenterPage, BillingSummaryCards, BillingCenterPage.test.

- [ ] **Step 1: Change tests first**

Mount with RechargeProvider. Assert 个人钱包, non-renewing copy, recharge-plan-grid, and that billing-recharge-section precedes billing-activity-section. Retain server-plan, Chinese error, poll, paymentId, visibility, and 120-attempt coverage.

- [ ] **Step 2: Remove duplicate payment state**

Delete BillingCenterPage local plans/payment/paymentId/polling. Keep ledger, usage, catalog, refreshData. Consume useRecharge and load plans on mount.

~~~tsx
<BillingSummaryCards summary={billingSnapshot.summary} />
<section data-testid="billing-recharge-section">
  <RechargePanel
    busyPlanKey={recharge.busyPlanKey}
    onRetry={() => void recharge.loadPlans()}
    onSelect={(plan) => void recharge.beginCheckout(plan)}
    plans={recharge.plans}
    status={recharge.plansStatus}
  />
</section>
<div data-testid="billing-activity-section"><BillingActivityTable items={activityRows} /></div>
<RedeemCodeBox onRedeemed={refreshData} />
~~~

Do not instantiate another checkout hook. Keep four real wallet summary values and remove meaningless progress decoration.

- [ ] **Step 3: Verify**

~~~bash
npx vitest --run src/billing/BillingCenterPage.test.tsx src/billing/RechargePanel.test.tsx src/billing/PaymentStatusPanel.test.tsx src/billing/useBillingSummarySnapshot.test.tsx
~~~

Expected: PASS.

- [ ] **Step 4: Commit**

~~~bash
git add src/billing/BillingCenterPage.tsx src/billing/BillingCenterPage.test.tsx src/billing/BillingSummaryCards.tsx
git commit -m "feat: make recharge primary on billing page"
~~~

## Task 5: Visible Entries Across Creator Surfaces

**Files:** Modify WorkspaceShell, FlowTopToolbar, WorkbenchMobileShell, WorkbenchPage and tests.

- [ ] **Step 1: Add shell tests**

Assert nav label 账单, absence of 账单充值, global 充值积分 opens dialog, and account-card 立即充值 closes menu then opens same dialog.

- [ ] **Step 2: Implement shell**

Consume useRecharge. Add a compact desktop balance plus cyan 充值 action before account controls. Add full-width 立即充值 inside the account balance card. Keep menu density tokens for actual menu rows.

- [ ] **Step 3: Add canvas test and action**

Mount toolbar with provider. Convert passive balance pill into button named 充值积分, title 当前积分，点击充值, opening source canvas. Respect hideUtilityActions.

- [ ] **Step 4: Add workbench test and actions**

Desktop and 390px mobile headers receive a compact 充值积分 action. Pass onRecharge into WorkbenchMobileShell. Clicking must not navigate or clear draft.

- [ ] **Step 5: Verify**

~~~bash
npx vitest --run src/app/WorkspaceShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/workbench/WorkbenchPage.test.tsx
~~~

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add src/app/WorkspaceShell.tsx src/app/WorkspaceShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/workbench/WorkbenchMobileShell.tsx src/workbench/WorkbenchPage.tsx src/workbench/WorkbenchPage.test.tsx
git commit -m "feat: expose recharge across creator surfaces"
~~~

## Task 6: Insufficient-Credit Prompts

**Files:** Create workbenchPricing and test. Modify WorkbenchComposer, WorkbenchPage/test, v2WorkflowRunner/test.

- [ ] **Step 1: Extract estimate and test**

~~~ts
export function getWorkbenchEstimatedCredits(
  draft: Pick<WorkbenchDraft, 'quantity' | 'size'>,
): number {
  const size = String(draft.size || '').toLowerCase();
  const perImage = size === '2k' ? 2 : 4;
  return Math.max(1, draft.quantity || 1) * perImage;
}
~~~

Assert 1x2K=2, 4x2K=8, 1x4K=4, zero quantity normalizes to one.

- [ ] **Step 2: Add failing workbench tests**

With balance 1 and estimate 2, assert no createWorkbenchGeneration call, visible copy 预计消耗 2 积分，当前可用 1 积分, button 余额不足，立即充值, and prompt preserved after opening. Repeat mobile sheet.

- [ ] **Step 3: Implement workbench guard**

Add availableCredits/onRecharge to WorkbenchComposer. When insufficient, CTA calls onRecharge, never onGenerate. Keep parent guard:

~~~ts
const handleGenerate = React.useCallback(() => {
  const required = getWorkbenchEstimatedCredits(draft);
  if (availableCredits !== null && availableCredits < required) {
    recharge.openRecharge({ source: 'workbench' });
    return;
  }
  void submit(draft);
}, [availableCredits, draft, recharge, submit]);
~~~

Use it in all workbench layouts without resetting draft.

- [ ] **Step 4: Add canvas failing assertion**

Existing INSUFFICIENT_CREDITS test listens for RECHARGE_REQUEST_EVENT and expects availableCredits 40, requiredCredits 100, source canvas; run/reserve/enqueue remain untouched.

- [ ] **Step 5: Dispatch at fail-closed check**

~~~ts
requestRecharge({
  availableCredits: effectiveAvailable,
  requiredCredits: estimatedCredits,
  source: 'canvas',
});
~~~

Place immediately before current insufficient-credit throw. Do not change error code, message, ordering, reserve, or enqueue behavior.

- [ ] **Step 6: Verify**

~~~bash
npx vitest --run src/workbench/workbenchPricing.test.ts src/workbench/WorkbenchPage.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts
~~~

Expected: PASS including no-reserve and missing-pricing tests.

- [ ] **Step 7: Commit**

~~~bash
git add src/workbench/workbenchPricing.ts src/workbench/workbenchPricing.test.ts src/workbench/WorkbenchComposer.tsx src/workbench/WorkbenchPage.tsx src/workbench/WorkbenchPage.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts
git commit -m "feat: prompt recharge before insufficient runs"
~~~

## Task 7: Verification And Project Record

**Files:** Modify PROJECT_RECORD.md. Verify Tasks 1-6.

- [ ] **Step 1: Focused tests**

~~~bash
npx vitest --run src/billing/RechargePanel.test.tsx src/billing/useRechargeCheckout.test.tsx src/billing/PaymentStatusPanel.test.tsx src/billing/rechargeRequest.test.ts src/billing/RechargeContext.test.tsx src/billing/RechargeDialog.test.tsx src/billing/BillingCenterPage.test.tsx src/app/AppRouter.test.tsx src/app/WorkspaceShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/workbench/workbenchPricing.test.ts src/workbench/WorkbenchPage.test.tsx
~~~

Expected: PASS.

- [ ] **Step 2: Production build**

~~~bash
npm run build
~~~

Expected: exit 0; TypeScript/bundle errors block completion.

- [ ] **Step 3: Browser acceptance**

Start v2 infra/API/worker/frontend per docs/v2-local-development.md. At 1440x900 verify billing hierarchy, 3-card fit, global entries, dialog dismissal, payment state. At 390x844 verify one-column cards, no overlap/scroll, preserved workbench draft, and mobile redirect. If infrastructure is unavailable, record exact failing command.

- [ ] **Step 4: Update project record**

Add dated entry covering global entry, plan grid, shared checkout, billing hierarchy, insufficient prompts, exact tests/build/browser status, and unchanged payment API/wallet mutation/non-renewing semantics.

- [ ] **Step 5: Final checks**

~~~bash
git diff --check
git status --short
~~~

Expected: no whitespace errors; stage only plan files and preserve unrelated changes.

- [ ] **Step 6: Commit**

~~~bash
git add PROJECT_RECORD.md
git commit -m "docs: record recharge experience upgrade"
~~~

## Completion Criteria

- Recharge is reachable from shell, account menu, canvas toolbar, workbench desktop, and workbench mobile.
- One provider and state machine serve all entry points.
- /billing presents recharge before activity.
- UI says 一次购买，立即到账，不自动续费.
- Only server plans create checkout.
- No invented bonus, old price, discount, or subscription data appears.
- Insufficient balance creates no run, reserve, or queue work.
- Paid invalidates wallet summary and recovers through paymentId.
- No secrets or authoritative payment state enter frontend storage.
- Focused tests and npm run build pass, or infrastructure-only browser blocker is documented.
- PROJECT_RECORD.md records final evidence.

